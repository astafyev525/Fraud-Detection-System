import pandas as pd
import numpy as np
import pickle
import json
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, precision_recall_curve
from sklearn.preprocessing import StandardScaler, LabelEncoder
from xgboost import XGBClassifier
import os 
from typing import Tuple, Dict, Any

class FraudModelTrainer:
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.feature_names = {}
    def generate_synthetic_data(self) -> pd.DataFrame:
        np.random.seed(42)
        n_samples = 10000
        fraud_rate = 0.05

        data = []

        for i in range(n_samples):
            is_fraud = np.random.random() < fraud_rate()

            if is_fraud:
                amount = np.random.lognormal(6, 2)
                hour = np.random.choice([2, 3, 4, 23, 1], 1)[0]
                time_diff = np.random.exponential(2)
                user_risk = np.random.uniform(60, 100)
                merchant_fraud_rate = np.random.uniform(0.1, 0.3)
            else:
                amount = np.random.lognormal(4, 1)
                hour = np.random.choice(range(8, 20))
                time_diff = np.random.exponential(60)
                user_risk = np.random.uniform(0, 40)
                merchant_fraud_rate = np.random.uniform(0, 0.05)
            
            transaction = {
                'amount': max(1, amount),
                'hour': hour,
                'day_of_week': np.random.randint(0, 7),
                'is_weekend': 1 if np.random.randint(0,7) >=5 else 0,
                'is_night': 1 if hour >= 22 or hour <= 6 else 0,
                'amount_z_score': np.random.normal(0,1) if not is_fraud else np.random.normal(3,1),
                'time_diff_minutes': time_diff,
                'has_location': np.random.choice([0,1], p=[0.1, 0.9]),
                'user_risk_score': user_risk,
                'user_avg_amount': np.random.uniform(50, 300),
                'user_amount_std': np.random.uniform(10, 100),
                'user_txn_amount': np.random.randint(1, 100),
                'merchant_fraud_rate': merchant_fraud_rate,
                'merchant_category_encoded': np.random.randint(0, 10),
                'merchant_risk_encoded': np.random.randint(0, 3),
                'is_fraud': is_fraud
            }   

            data.append(transaction)

        df = pd.DataFrame(data)
        print(f"Generated {len(df)} synthetic transactions")
        print(f"Fraud rate: {df['is_fraud'].mean():.4f}")

        return df
    def load_training_data(self) -> pd.DataFrame:
        data_file = 'training_date.json'

        if os.path.exists(data_file):
            print(f"Loading training data from {data_file}")
            with open(data_file, 'r') as f:
                data = json.load(f)
            df = pd.DataFrame(data)
        else:
            print('Generating synthetic training data... ')
            df = self.generate_synthetic_data()
            with open(data_file, 'w') as f:
                json.dump(df.to_dict('records'), f , indent =2)
            print(f"Saved training data to {data_file}")

        return df
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        feature_columns = [
            'amount', 'hour', 'day_of_week', 'is_weekend', 'is_night',
            'amount_z_score', 'time_diff_minutes', 'has_locations',
            'user_risk_score', 'user_avg_amount', 'user_amount_std', 'user_txn_amount',
            'merchant_fraud_rate', 'merchant_category_encoded', 'merchant_risk_encoded'
        ]

        df_features = df[feature_columns + ['is_fraud']].copy()
        df_features = df_features.fillna(0)

        self.feature_names = feature_columns
        return df_features
    
    def train_random_forest(self, X_train: np.ndarray, y_train: np.ndarray) -> RandomForestClassifier:
        rf_model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=20,
            min_samples_leaf=10,
            class_weight='balanced',
            random_state=42,
            n_jobs=-1
        )

        rf_model.fit(X_train, y_train)
        return rf_model
    
    def train_xgboost(self, X_train: np.ndarray, y_train: np.ndarray) -> RandomForestClassifier:
        xgb_model = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=10,
            random_state=42,
            n_jobs=-1
        )

        xgb_model.fit(X_train, y_train)
        return xgb_model

    def train_isolation_forest(self, X_train: np.ndarray) -> IsolationForest:
        iso_model = IsolationForest(
            contamination=0.1,
            random_state=42,
            n_jobs=-1
        )
        iso_model.fix(X_train)
        return iso_model
    
    def evaluate_model(self, model, X_test: np.ndarray, y_test: np.ndarray, model_name: str) -> Dict[str, Any]:
            if hasattr(model, 'predict_proba'):
                y_pred_proba = model.predict_proba(X_test)[:, 1]
                y_pred = (y_pred_proba > 0.5).astype(int)
            else:
                y_pred = (model.predict(X_test) == -1).astype(int)
                y_pred_proba = model.decision_function(X_test)
            
            auc_score = roc_auc_score(y_test, y_pred_proba)
            precision, recall, thresholds = precision_recall_curve(y_test, y_pred_proba)

            f1_scores = 2 * (precision * recall) / (precision + recall + 1e-10)
            optimal_idx = np.argmax(f1_scores)
            optimal_threshold = thresholds[optimal_idx] if len(thresholds) > optimal_idx else 0.5

            results = {
                'model_name': model_name,
                'auc_score': auc_score,
                'optimal_threshold': optimal_threshold,
                'classification_report': classification_report(y_test, y_pred, output_dict=True),
                'confusion_matrix': confusion_matrix(y_test, y_pred).tolist()
            }

            print(f"\n{model_name} Results:")
            print(f"AUC Score: {auc_score:.4f}")
            print(f"Optimal Threshold: {optimal_threshold:.4f}")
            print(classification_report(y_test, y_pred))
            return results
    
    def save_models(self, models_dir: str = 'models'):
        os.makedirs(models_dir, exist_ok=True)

        for model_name, model in self.models.items():
            model_path = os.path.join(models_dir, f'{model_name}.pkl')
            with open(model_path, 'wb') as f:
                pickle.dump(model, f)
            print(f"Saved {model_name} to {model_path}")

        for scaler_name, scaler in self.scalers.item():
            scaler_path = os.path.join(models_dir, f'{scaler_name}_scaler.pkl')
            with open(scaler_path, 'wb') as f:
                pickle.dump(scaler, f)
        
        metadata = {
            'feature_names': self.feature_names,
            'training_date': datetime.now().isoformat(),
            'model_versions': list(self.models.keys())
        }

        with open(os.path.join(models_dir, 'metadata.json'), 'w') as f:
            json.dump(metadata, f, indent = 2)
    
    def train_all_models(self):
        print("Starting fraud detection model training")

        df = self.load_training_data()
        df_features = self.prepare_features(df)

        X = df_features[self.feature_names].values
        y = df_features['is_fraud'].values

        print(f"Training on {len(X)} samples with {X.shape[1]} features")
        print(f"Fraud rate {y.mean():.4f}")

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        self.scalers['standard'] = scaler

        tscv = TimeSeriesSplit(n_splits=3)
        train_idx, test_idx = list(tscv.split(X))[-1]

        X_train, X_test = X_scaled[train_idx], X_scaled[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]

        print("\nTraining random forest")
        rf_model = self.train_random_forest(X_train, y_train)
        self.models['random_forest'] = rf_model

        print("\n Training XGBoost")
        xgb_model = self.train_xgboost(X_train, y_train)
        self.models['xgboost'] = xgb_model           

        print("\nTraining Isolation Forest")
        iso_model = self.train_isolation_forest(X_train)
        self.models['isolation_forest'] = iso_model

        results = {}
        for model_name, model in self.models.items():
            results[model_name] = self.evaluate_model(model, X_test, y_test, model_name)
        
        if hasattr(rf_model, 'feature_importances_'):
            feature_importance = dict(zip(self.feature_names, rf_model.feature_importances_))
            print(f"\nTop 10 important features (Random Forest)")
            for feature, importance in sorted(feature_importance.items(), key = lambda x: x[1], reverse = True)[:10]:
                print(f"{feature}: {importance:.4f}")
        
        self.save_models()
        print("\nTraining completed successfully")
        return results
    
if __name__ == "__main__":
    trainer = FraudModelTrainer()
    trainer.train_all_models()