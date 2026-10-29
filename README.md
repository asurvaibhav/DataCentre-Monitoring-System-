XOR AO-02: Executive Data Center Capacity Advisory & Multi-Agent Diagnostic Platform

Team Name: XOR

Team ID: UG-41

Platform Version: AO-02 Release Candidate

Deployment Target: Vercel Hybrid Serverless Infrastructure

Executive Summary

XOR AO-02 is an enterprise-grade data center capacity advisory and multi-agent diagnostic platform built for mission-critical infrastructure management. Designed around a Deterministic RAG Forecasting Engine and a continuous Multi-Agent Pipeline, the system delivers real-time telemetry ingestion, root-cause analysis (RCA), capacity exhaustion forecasting, and automated operational remediation.

The system ensures complete operational safety through Immutable Decision Recording—maintaining a full audit trail of human-in-the-loop acknowledgments and system advisories with zero unverified physical actuation paths.

Technical Architecture

                                +---------------------------------------+
                                |      XOR AO-02 UI / Console           |
                                |  (Interactive Heatmaps & Metrics)     |
                                +-------------------+-------------------+
                                                    |
                                      HTTP / WS     | /api & /stream
                                                    v
                                +---------------------------------------+
                                |            FastAPI Backend            |
                                |     (Asynchronous API & WebSockets)   |
                                +-------------------+-------------------+
                                                    |
             +--------------------------------------+--------------------------------------+
             |                                      |                                      |
             v                                      v                                      v
+------------------------+              +------------------------+              +------------------------+
|    Ingestion Agent     |              |    Monitoring Agent    |              |       RCA Agent        |
| Telemetry & Normalizer |              | Thresholds & Anomalies |              | Diagnostic Reasoner    |
+------------------------+              +------------------------+              +------------------------+
             |                                      |                                      |
             +--------------------------------------+--------------------------------------+
                                                    |
                                                    v
                                +---------------------------------------+
                                |  Deterministic RAG Forecasting Engine |
                                | (Thermal, Power, Storage & Network)   |
                                +-------------------+-------------------+
                                                    |
                                                    v
                                +---------------------------------------+
                                |    Immutable Audit & Decision Log     |
                                |       (SQLite / Append-Only)          |
                                +---------------------------------------+


Core Architecture Components

Multi-Agent Diagnostic Pipeline:

Ingestion Agent: Processes multi-source telemetry streams (power kW, rack thermal gradients, network backplane Gbps, storage utilization).

Monitoring Agent: Continuously tracks physical boundaries against operational safety thresholds.

RCA Agent: Performs multi-step root-cause diagnostics using context-aware retrieval.

Remediation Agent: Generates non-actuating action plans requiring operator confirmation.

Deterministic RAG Forecasting Engine:

Implements mathematical fallback models to eliminate ungrounded states ("Not estimated").

Computes precise operational exhaustion timelines (e.g., storage exhaustion windows, power load headroom).

Operational Failure & Edge-Case Protection:

Tested against severe edge-case scenarios including Power Surges (8.4 kW), Thermal Spikes (>25°C), Network Saturation (88.0 Gbps), Database Storage Exhaustion (84% @ 45TB), and CRAC Unit Pressure Variations.

Immutable Decision Recording:

Every state transition, operator acknowledgment, and remediation decision is permanently recorded in an append-only audit ledger.

Repository Structure

AO-02/
├── .github/
│   └── workflows/              # CI/CD verification workflows
├── backend/
│   ├── app/
│   │   ├── api/                # REST & WebSocket endpoint routes
│   │   ├── core/               # Configuration, security, & constants
│   │   ├── models/             # Pydantic schemas & database models
│   │   ├── services/           # Multi-agent engines, ingestion & RAG logic
│   │   └── main.py             # FastAPI main entrypoint & WS handler
│   ├── tests/                  # Automated test suite (TC-AGT & TC-OPS)
│   ├── requirements.txt        # Backend dependencies
│   └── runtime.txt             # Python runtime specification (e.g., python-3.11)
├── frontend/
│   ├── src/                    # Frontend UI application
│   ├── public/                 # Static assets
│   ├── package.json            # Node.js dependencies
│   └── vite.config.js          # Build configuration
├── vercel.json                 # Unified deployment manifest for Vercel
└── README.md                   # System documentation


Local Development & Setup

Prerequisites

Python: 3.11 or higher

Node.js: v18.0.0 or higher

Package Managers: pip, npm

1. Backend Setup

Navigate to the backend directory:

cd backend


Install required Python packages:

python -m pip install -r requirements.txt


Required Core Packages: fastapi, uvicorn[standard], python-dotenv, pydantic, numpy, pandas, mangum

Start the Uvicorn development server on port 8000:

python -m uvicorn app.main:app --reload --port 8000


The FastAPI backend will be live at http://localhost:8000 with interactive docs available at http://localhost:8000/docs.

2. Frontend Setup

Open a second terminal and navigate to the frontend directory:

cd frontend


Install Node dependencies:

npm install


Start the development server:

npm run dev


Automated Test Specification Suite

The platform includes a dedicated test matrix verifying both agent capabilities and infrastructure resilience:

Test ID

Domain

Target Component

Validation Metric

Status

TC-AGT-01

Multi-Agent

Orchestration & Retrieval

14-day telemetry extraction without JSON parsing failure

PASS

TC-AGT-02

Multi-Agent

Human-in-the-Loop & Audit Log

Operator state changes recorded in append-only log

PASS

TC-AGT-03

Multi-Agent

Deterministic RAG Fallback

Eliminates "Not estimated" states under noisy inputs

PASS

TC-AGT-04

Security

Tenant Role Authorization

Strict rejection (HTTP 403) on missing auth headers

PASS

TC-OPS-01

Operations

Thermal & Power Spikes

Alert triggered within 1 tick cycle for 8.4 kW / >25°C

PASS

TC-OPS-02

Operations

Network Saturation

LAG-2 advisory triggered for 88.0 Gbps load

PASS

TC-OPS-03

Operations

Storage Exhaustion

Exact date calculation at 84% / 45 TB threshold

PASS

TC-OPS-04

Operations

Concurrency Overload

Zero dropped records under peak telemetry burst

PASS

TC-OPS-05

Operations

Health & Recovery

Endpoint /api/health returns status clean during sync

PASS

TC-OPS-06

Operations

CRAC Pressure Delta

Maintenance notification generated for 140 Pa delta

PASS

Deployment to Vercel

The repository is configured for unified deployment on Vercel using @vercel/python serverless functions for the FastAPI backend and static output hosting for the UI.

Step 1: Ensure Serverless Adapter in Backend

Make sure backend/app/main.py includes Mangum to handle serverless execution:

from fastapi import FastAPI
from mangum import Mangum

app = FastAPI(title="XOR AO-02 Platform API", version="1.0.0")

# API routes definition...

# Vercel Serverless Handler
handler = Mangum(app)


Step 2: Deploy via Vercel CLI or Dashboard

Push your changes to your Git repository:

git add .
git commit -m "Configure Vercel hybrid deployment for XOR AO-02"
git push origin main


Import the repository into your Vercel Dashboard.

Vercel will automatically read the root vercel.json and deploy both the backend API (/api/*) and frontend interface.

Team Contact & Support

Team Name: XOR

Team ID: UG-41

System Candidate: XOR AO-02 Platform Release Candidate
