import unittest
from datetime import datetime, timedelta, timezone
from app.core.ao02_state_and_graph import PriorityTokenQueue, ResourceType, IncidentToken

class PriorityPolicyTest(unittest.TestCase):
    def test_physical_risk_and_actual_breaches(self):
        score = PriorityTokenQueue.compute_priority_number
        self.assertLess(score(ResourceType.POWER, 96, 999), score(ResourceType.STORAGE, 96, 999))
        self.assertLess(score(ResourceType.STORAGE, 101, 999), score(ResourceType.POWER, 91, 999))
        self.assertLess(score(ResourceType.POWER, 101, 999), score(ResourceType.SOFTWARE_LICENSE, 101, 999))

    def test_confidence_and_monotonicity(self):
        score = PriorityTokenQueue.compute_priority_number
        for resource in ResourceType:
            values = [score(resource, value, 999) for value in range(80, 111)]
            self.assertTrue(all(1 <= n <= 100 for n in values))
            self.assertEqual(values, sorted(values, reverse=True))
        self.assertLess(score(ResourceType.STORAGE, 86, .1, .9), score(ResourceType.STORAGE, 86, .1, .2))

    def test_dequeue_and_fifo_ties(self):
        queue = PriorityTokenQueue()
        now = datetime.now(timezone.utc)
        low = IncidentToken(priority_number=80, rack_id='R-01', tenant_id='T1', resource_type=ResourceType.STORAGE)
        first = IncidentToken(priority_number=10, rack_id='R-02', tenant_id='T1', resource_type=ResourceType.POWER, created_at=now)
        second = IncidentToken(priority_number=10, rack_id='R-03', tenant_id='T1', resource_type=ResourceType.POWER, created_at=now+timedelta(seconds=1))
        for token in [low, second, first]: queue.enqueue(token)
        self.assertEqual([queue.dequeue().token_id for _ in range(3)], [first.token_id, second.token_id, low.token_id])
