CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users(
    id UID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    home_latitude DECIMAL(10,8),
    home_longitude DECIMAL(11,8),
    risk_score DECIMAL(5,2) DEFAULT 0.0,
    total_transactions INTEGER DEFAULT 0,
    avg_transaction_amount DECIMAL(12,2) DEFAULT 0.0
);

CREATE TABLE merchants(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'LOW',
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    merchant_id UUID REFERENCES merchants(id),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    device_fingerprint VARCHAR(255),
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW(),
    fraud_score DECIMAL(5, 2),
    is_fraud BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    processing_time_ms INTEGER
);

CREATE TABLE fraud_rules(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,
    threshold_value DECIMAL(12,2),
    time_winow_minutes INTEGER,
    action VARCHAR(20) DEFAULT 'REVIEW',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_fraud_score ON transactions(fraud_score);
create INDEX idx_users_email ON users(email);
CREATE INDEX idx_transactions_amount ON transactions(amount);
CREATE INDEX idx_merchants_category ON merchants(category);

INSERT INFO fraud_rules (name, description, rule_type, threshold_value, time_winow_minutes, action) VALUES
('High Amount Transaction', 'Block transactions over $5000', 'AMOUNT', 5000.00, NULL, 'BLOCK'),
('Velocity Check', 'Review is more than 5 transactions in 10 minutes', 'VELOCITY', 5, 10, 'REVIEW'),
('Unusual Hour', 'Review transactions between 2 AM and 6 AM', 'TIME', NULL, NULL, 'REVIEW'),
('Large Cash Withdrawal', 'Review cash withdrawals over $1000', 'AMOUNT', 1000.00, NULL, 'REVIEW');


INSERT INFO merchants(name, category, risk_level, latitude, longitude) VALUES
('Starbucks Downtown', 'COFFEE', 'LOW', 40.7589, -73.9851),
('Shell Gas Station', 'GAS', 'LOW', 40.7505, -73.9934),
('Amazon online', 'ECOMMERCE', 'MEDIUM', NULL, NULL),
('ATM Withdrawal', 'ATM', 'LOW', 40.7614, -73.9776),
('Luxury Boutique', 'RETAIL', 'HIGH', 40.7736, -73.9566);

INSERT INFO users(email, home_latitude, home_longitude, risk_score) VALUES
('john.dow@email.com', 40.7505, -73.9934, 0.2),
('jane.smith@email.com', 40.7614, -73.9851, 0.1),
('suspicous.user@email.com', 40.7589, -73.9851, 0.8);