import unittest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import get_ingestion
from app.services.ingestion import IngestionService
from app.core.ao02_state_and_graph import SharedContextHeap, PriorityTokenQueue, ResourceType
from app.core.telemetry_generator import TelemetryPoint


class CSVUploadTest(unittest.TestCase):
    def test_import_and_invalid_upload_is_atomic(self):
        service = IngestionService(SharedContextHeap(), PriorityTokenQueue())
        old = TelemetryPoint(datetime.now(timezone.utc), 'R-02', 'FACILITY', ResourceType.POWER, 30, 'kW')
        service._points = service.generator.points = [old]
        app.dependency_overrides[get_ingestion] = lambda: service
        try:
            with TestClient(app) as client:
                header = 'timestamp,rack_id,tenant_id,resource_type,value,unit\n'
                response = client.post('/ingest/upload', content=header + '2026-10-29T10:00:00Z,R-01,FACILITY,POWER,42,kW\n', headers={'Content-Type': 'text/csv'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(service.generator.latest_point('R-01', 'FACILITY', ResourceType.POWER).value, 42)
                self.assertEqual(service.generator.latest_point('R-02', 'FACILITY', ResourceType.POWER), old)
                before = list(service._points)
                for invalid in ['bad,headers\n', header, header + 'bad,R-01,FACILITY,POWER,42,kW\n', header + '2026-10-29,R-01,FACILITY,POWER,nan,kW\n']:
                    self.assertEqual(client.post('/ingest/upload', content=invalid).status_code, 400)
                    self.assertEqual(service._points, before)
        finally:
            app.dependency_overrides.clear()


class FlexibleCSVTest(unittest.TestCase):
    def test_aliases_and_units(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        points = parse_csv_telemetry('Customer ID;Measured Value;Server-ID;Recorded At;Metric Name;Units\nFACILITY;42000;R-01;2026-10-29T10:00:00Z;Power Consumption;watts\n')
        self.assertEqual(points[0].value, 42)
        self.assertEqual(points[0].unit, 'kW')

    def test_wide_columns(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        points = parse_csv_telemetry('TIME,HOSTNAME,TENANT,Power (kW),Network Bandwidth (Mbps),Storage (%),Notes\n2026-10-29,R-01,T1,42,500,75,hello\n')
        self.assertEqual([p.value for p in points], [42, .5, 75])
        points = parse_csv_telemetry('Time,Server,Customer,Power (%)\n2026-10-29,R-01,FACILITY,50\n')
        self.assertEqual(points[0].value, 40)

    def test_ambiguous_or_unknown_headers(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        for text in ['Time,Timestamp,Server,Customer,Power\n2026-10-29,2026-10-29,R-01,FACILITY,42\n', 'Time,Server,Customer,Mystery Sensor\n2026-10-29,R-01,FACILITY,42\n']:
            with self.assertRaises(ValueError):
                parse_csv_telemetry(text)


class StorageImportTest(unittest.TestCase):
    def test_sizes_capacities_and_identifiers(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        cases = [
            ('Time,Rack,Tenant,Storage (TB),Storage Capacity\n2026-10-29,r1,t03,8,10\n', None, 80),
            ('Time,Rack,Tenant,Storage (GB),Storage Capacity TB\n2026-10-29,R-01,T1,8000,10\n', None, 80),
            ('Time,Rack,Tenant,Storage (GiB),Storage Capacity\n2026-10-29,R-01,T1,512,1 TiB\n', None, 50),
            ('Time,Rack,Tenant,Resource,Value,Unit\n2026-10-29,R-01,T1,STORAGE,8,TB\n', 10, 80),
        ]
        for text, capacity, expected in cases:
            points = parse_csv_telemetry(text, capacity)
            self.assertAlmostEqual(points[0].value, expected)
            self.assertEqual(points[0].unit, '%')
            self.assertEqual(points[0].rack_id, 'R-01')
        with self.assertRaisesRegex(ValueError, 'total capacity'):
            parse_csv_telemetry(cases[-1][0])
        with self.assertRaisesRegex(ValueError, 'capacity must be positive'):
            parse_csv_telemetry(cases[0][0].replace(',8,10', ',8,0'))

    def test_upload_scan_and_telemetry_roundtrip(self):
        service = IngestionService(SharedContextHeap(), PriorityTokenQueue())
        old = TelemetryPoint(datetime.now(timezone.utc), 'R-02', 'FACILITY', ResourceType.POWER, 30, 'kW')
        service._points = service.generator.points = [old]
        app.dependency_overrides[get_ingestion] = lambda: service
        app.dependency_overrides[__import__('app.api.deps', fromlist=['get_queue']).get_queue] = lambda: service.queue
        app.dependency_overrides[__import__('app.api.deps', fromlist=['get_heap']).get_heap] = lambda: service.heap
        text = 'Time,Server,Customer,Resource,Reading,Units\n' + ''.join(f'2026-10-{i+1:02d}T00:00:00Z,R-12,T3,Storage,{8+i*.1},TB\n' for i in range(12))
        try:
            with TestClient(app) as client:
                response = client.post('/ingest/upload?storage_capacity_tb=10', content=text)
                self.assertEqual(response.status_code, 200, response.text)
                result = client.get('/telemetry/window', params={'rack_id':'R-12','tenant_id':'T3','resource_type':'STORAGE'}).json()
                self.assertEqual(result['count'], 12)
                self.assertAlmostEqual(result['points'][-1]['value'], 91)
                self.assertEqual(response.json()['tokens_minted'], 1)
                self.assertTrue(any(t.rack_id=='R-12' and t.tenant_id=='T3' for t in service.queue.snapshot()))
                duplicate = client.post('/ingest/upload?storage_capacity_tb=10', content=text)
                self.assertEqual(duplicate.json()['tokens_minted'], 0)
                before = list(service._points)
                invalid = client.post('/ingest/upload', content=text)
                self.assertEqual(invalid.status_code, 400)
                self.assertEqual(service._points, before)
        finally:
            app.dependency_overrides.clear()



class UnitCompatibilityTest(unittest.TestCase):
    def test_all_resource_unit_aliases(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        cases = [
            ('POWER', 'watt', 42000, 42), ('POWER', 'megawatts', .042, 42),
            ('STORAGE', 'TB', 8, 80), ('VM_COMPUTE', 'VM', 42, 42),
            ('VM_COMPUTE', 'virtual machines', 42, 42), ('VM_COMPUTE', 'count', 42, 42),
            ('SOFTWARE_LICENSE', 'Seat', 42, 42), ('SOFTWARE_LICENSE', 'License', 42, 42),
            ('NETWORK', 'Mbit/s', 500, .5), ('NETWORK', 'Kbps', 500000, .5),
            ('THERMAL_COOLING', 'degrees Celsius', 25, 25), ('THERMAL_COOLING', 'F', 77, 25),
        ]
        for resource, unit, value, expected in cases:
            with self.subTest(resource=resource, unit=unit):
                text = f'Time,Rack,Tenant,Resource,Value,Unit,Capacity\n2026-10-29,R-01,T1,{resource},{value},{unit},10\n'
                self.assertAlmostEqual(parse_csv_telemetry(text)[0].value, expected)

    def test_multiple_errors_and_invalid_numeric_grouping(self):
        from app.services.csv_telemetry import parse_csv_telemetry
        text = 'Time,Rack,Tenant,Resource,Value,Unit\n2026-10-29,R-01,T1,VM_COMPUTE,42,bananas\n2026-10-29,R-01,T1,POWER,42,kWh\n'
        with self.assertRaises(ValueError) as result:
            parse_csv_telemetry(text)
        self.assertIn('Row 2:', str(result.exception))
        self.assertIn('Row 3:', str(result.exception))
        with self.assertRaises(ValueError):
            parse_csv_telemetry('Time,Rack,Tenant,Power\n2026-10-29,R-01,T1,"1,2"\n')

class AutoScanTest(unittest.TestCase):
    def test_short_breach_queues_and_healthy_does_not(self):
        service = IngestionService(SharedContextHeap(), PriorityTokenQueue())
        service._points = service.generator.points = [TelemetryPoint(datetime.now(timezone.utc), 'R-02', 'FACILITY', ResourceType.POWER, 90, 'kW')]
        app.dependency_overrides[get_ingestion] = lambda: service
        try:
            with TestClient(app) as client:
                result = client.post('/ingest/upload', content='Time,Rack,Tenant,Resource,Value,Unit\n2026-10-29,R-12,T3,STORAGE,95,%\n2026-10-29,R-01,FACILITY,POWER,20,kW\n')
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()['tokens_minted'], 1)
                token = service.queue.snapshot()[0]
                self.assertEqual(token.rack_id, 'R-12')
                self.assertEqual(service.heap.get_envelope_for_agent(token.token_id).telemetry.current_utilization_pct, 95)
        finally:
            app.dependency_overrides.clear()

if __name__ == '__main__':
    unittest.main()
