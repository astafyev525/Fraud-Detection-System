from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np
import json
import os
from datetime import datetime
from typing import Dict, List, Any

app = Flask(__name__)
CORS(app)

class FraudModelService:
    def __init__(self, models_dir: str = 'models'):
        self.models = {}
        self.scalers = {}
        self.feature_names = {}
        self.metadata = {}
        self.models_dir = models_dir
        self.load_models()
    
    def load_models(self):
        if not os.path.exists(self.models_dir):
            print(f"Models directory {self.models_dir} not found")
            return
        
        metadata_path = os.path.join(self.models_dir, 'metadata.json')
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                self.metadata = json.load(f)
                self.feature_names = self.metadata.get('feature_names', [])
        
        model_files =  ['random_forest.pkl', 'xgboost.pkl', 'isolation_forest.pkl']
        for model_file in model_files:
            model_path = os.path.join(self.models_dir, model_file)
            if os.path.exists(model_path):
                model_name = model_file.replace(',pkl', '')
                with open(model_path, 'rb') as f:
                    self.models[model_name] = pickle.load(f)
                print(f"Loaded {model_name} model")
        
        scaler_path = os.path.join(self.models_dir, 'standard_scaler.pkl')
        if os.path.exists(scaler_path):
            with open(scaler_path, 'rb') as f:
                self.scalers['standard'] = pickle.load(f)
            print("Loaded standard scaler")
        
        print(f"Model service initialized with {len(self.models)} models")
    def extract_features(self, transaction_data: Dict) -> np.ndarray:
        features = {
            'amount': transaction_data.get('amount', 0),
            'hour': transaction_data.get('hour', 12),
            'day_of_week': transaction_data.get('day_of_week', 0),
            'is_weekend': transaction_data.get('is_weekend', 0),
            'is_night': transaction_data.get('is_night', 0),
            'amount_z_score': transaction_data.get('amount_z_score', 0),
            'time_diff_minutes': transaction_data.get('time_diff_minutes', 60),
            'has_location': transaction_data.get('has_location', 1),
            'user_risk_score': transaction_data.get('user_risk_score', 20),
            'user_avg_amount': transaction_data.get('user_avg_amount', 100),
            'user_amount_std': transaction_data.get('user_amount_std', 50),
            'user_txn_count': transaction_data.get('user_txn_count', 10),
            'merchant_fraud_rate': transaction_data.get('merchant_fraud_rate', 0.02),
            'merchant_category_encoded': transaction_data.get('merchant_category_encoded', 0),
            'merchant_risk_encoded': transaction_data.get('merchant_risk_encoded', 0)
        }

        feature_vector = [features[name] for name in self.feature_names]
        return np.array(feature_vector).resape(1, -1)
    
    def predict_fraud(self, transaction_data: Dict) -> Dict[str, Any]:
        if not self.models:
            return {
                'error': 'No models loaded. Please train models first',
                'fraud_score': 0,
                'model_predictions': {}
            }
        features = self.extract_features(transaction_data)
        if 'standard' in self.scalers:
            features_scaled = self.scalers['standard'].transform(features)
        else:
            features_scaled = features

        predictions = {}
        if 'random_forest' in self.models:
            rf_proba = self.models['random_forest'].predict_proba(features_scaled)[0]
            predictions['random_forest'] = {
                'fraud_probability': float(rf_proba[1]),
                'prediction': int(rf_proba[1] > 0.5)
            }
        if 'xgboost' in self.models:
            xgb_proba = self.models['xgboost'].predict_proba(features_scaled)[0]
            predictions['xgboost'] = {
                'fraud_probability': float(xgb_proba[1]),
                'prediction': int(xgb_proba[1] > 0.5)
            }
        if 'isolation_forest' in self.models:
            iso_score = self.models['isolation_forest'].decision_function(features_scaled)[0]
            iso_pred = self.models['isolation_forest'].predict(features_scaled)[0]
            predictions['isolation_forest'] = {
                'anomaly_score': float(iso_score),
                'is_anomaly': int(iso_pred == -1)
            }
        
        fraud_scores = []
        if 'random_forest' in predictions:
            fraud_scores.append(predictions['random_forest']['fraud_probability'])
        if 'xgboost' in predictions:
            fraud_scores.append(predictions['xgboost']['fraud_probability'])
        
        ensemble_score = np.mean(fraud_scores) if fraud_scores else 0

        if ensemble_score >= 0.8:
            risk_level = 'HIGH'
            action = 'BLOCK'
        elif ensemble_score >= 0.5:
            risk_level = 'MEDIUM'
            action = 'REVIEW' 
        else:
            risk_level = 'LOW'
            action = 'ALLOW'
        
        return {
            'fraud_score': float(ensemble_score * 100),
            'risk_level': risk_level,
            'action': action,
            'model_predictions': predictions,
            'feature_count': len(self.feature_names),
            'models_used': list(predictions.keys()) 
        }
    
    def get_feature_importance(self, model_name: str = 'random_forest') -> Dict[str, float]:
        if model_name not in self.models :
            return {}
        model = self.models[model_name]
        if hasattr(model, 'feature_importances_'):
            importance_dict = dict(zip(self.feature_names, model.feature_importances_))
            return dict(sorted(importance_dict.items(), key = lambda x : x[1], reverse=True))
        
        return {}

model_service = FraudModelService()

@app.route('/health', methods = ['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'models_loaded': len(model_service.models),
        'available)models': list(model_service.models.keys()),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/predict', methods = ['POST'])
def predict_fraud():
    try:
        transaction_data = request.json
        if not transaction_data:
            return jsonify({'error': 'No transaction data provided'}), 400
        start_time = datetime.now()
        prediction = model_service.predict_fraud(transaction_data)
        processing_time = (datetime.now() - start_time).total_seconds() * 1000

        response = {
            'success': True,
            'prediction': prediction,
            'processing_time_ms': processing_time,
            'timestamp': datetime.now().isoformat()
        }
        return jsonify(response)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500
    
@app.route('/feature-importance', methods = ['GET'])
def get_feature_importance():
    model_name = request.args.get('model', 'random_forest')

    importance = model_service.get_feature_importance(model_name)

    return jsonify({
        'model': model_name,
        'feature_importance': importance,
        'timestamp': datetime.now().isoformat() 
    })

@app.route('/models', methods = ['GET'])
def get_models_info():
    return jsonify({
        'models': list(model_service.models.keys()),
        'feature_names': model_service.feature_names,
        'metadata': model_service.metadata,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/reload', methods = ['POST'])
def reload_models():
    try:
        model_service.load_models()
        return jsonify({
            'success': True,
            'message': 'Models loaded successfully',
            'models_loaded': len(model_service.models),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'timestmap': datetime.now().isoformat()
        }), 500
    
if __name__ == '__main__':
    print("Starting ML Model Serving API...")
    print(f"Available models: {list(model_service.models.keys())}")
    print("API endpoints:")
    print("  POST /predict - Predict fraud for transaction")
    print("  GET /feature-importance - Get model feature importance")
    print("  GET /models - Get model information")
    print("  GET /health - Health check")
    print("  POST /reload - Reload models")

    app.run(host = '0.0.0.0', port = 5000, debug = True)