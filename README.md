# Fraud Detection API 🔍

A production-ready Node.js backend with ML-powered fraud detection for financial services. Delivers real-time transaction scoring with sub-100ms response times using ensemble machine learning models and rule-based detection.

## 🎯 Key Features

- **Real-time fraud scoring** with sub-100ms API response times
- **Ensemble ML models** (Random Forest, XGBoost, Isolation Forest)
- **Multi-layered detection** combining rule-based and ML approaches
- **Comprehensive analytics** dashboard with fraud trends and alerts
- **Scalable architecture** built for high-volume transaction processing

## 🛠️ Tech Stack

- **Backend:** Node.js + TypeScript + Express.js
- **Database:** PostgreSQL + Redis
- **ML Pipeline:** Python + scikit-learn + XGBoost
- **Deployment:** Docker + Docker Compose

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+
- Docker & Docker Compose
- PostgreSQL

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd fraud-detection-system
```

2. **Install dependencies**
```bash
# Backend dependencies
npm install

# ML dependencies
cd ml
pip install -r requirements.txt
cd ..
```

3. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. **Start services with Docker**
```bash
docker-compose up -d
```

5. **Initialize database**
```bash
npm run db:migrate
npm run db:seed
```

6. **Train ML models**
```bash
cd ml
python train_model.py
cd ..
```

7. **Start the API**
```bash
npm run dev
```

## 📡 API Endpoints

### Core Fraud Detection
```http
POST /api/transactions/score
Content-Type: application/json

{
  "userId": "uuid",
  "merchantId": "uuid", 
  "amount": 150.00,
  "currency": "USD",
  "latitude": 40.7589,
  "longitude": -73.9851,
  "deviceFingerprint": "device_abc123",
  "ipAddress": "192.168.1.1"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_123456789",
    "fraudScore": 25,
    "riskLevel": "LOW",
    "action": "ALLOW",
    "reasons": [],
    "processingTimeMs": 85
  }
}
```

### Analytics Dashboard
```http
GET /api/analytics/dashboard?days=7
GET /api/analytics/trends?days=30
GET /api/analytics/high-risk?limit=20
```

### Health Check
```http
GET /health
```

## 🧠 ML Models

The system uses three complementary models:

1. **Random Forest** - Interpretable baseline with feature importance
2. **XGBoost** - High-performance gradient boosting for complex patterns  
3. **Isolation Forest** - Unsupervised anomaly detection

### Feature Engineering
- **Velocity features:** Transaction frequency patterns
- **Amount analysis:** Spending behavior anomalies
- **Temporal patterns:** Time-based fraud indicators
- **Geographic analysis:** Location-based risk assessment
- **Behavioral profiling:** User pattern deviation detection

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │────│   Fraud API     │────│   ML Engine     │
│                 │    │   (Node.js)     │    │   (Python)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │   Redis Cache   │
                       │   (Analytics)   │    │   (Real-time)   │
                       └─────────────────┘    └─────────────────┘
```

## 🔧 Development

### Running Tests
```bash
npm test
```

### Generate Test Data
```bash
curl -X POST http://localhost:3000/api/transactions/generate \
  -H "Content-Type: application/json" \
  -d '{"count": 100, "fraudRate": 0.05}'
```

### Monitor Performance
```bash
# View logs
npm run logs

# Check API metrics
curl http://localhost:3000/api/metrics
```
## 📝 Documentation

- [API Documentation](./docs/api.md)
- [ML Model Guide](./docs/ml-models.md)
- [Deployment Guide](./docs/deployment.md)
- [Architecture Overview](./docs/architecture.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
