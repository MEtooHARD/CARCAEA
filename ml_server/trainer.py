"""
XGBoost training and inference logic.
"""

import json
import numpy as np
import xgboost as xgb
from typing import Any

from config import FEATURE_NAMES, HRV_TARGETS, DEFAULT_HYPERPARAMS
from schemas import TrainingCase, Hyperparams, HRVDelta, PredictCase


def train_models(cases: list[TrainingCase], hyperparams: Hyperparams) -> dict[str, Any]:
    """
    Train 6 XGBoost regressors, one per HRV delta target.
    Returns a dict of {metric: xgb_json_dict}.
    """
    X = np.array([c.features for c in cases], dtype=np.float32)

    params = {
        **DEFAULT_HYPERPARAMS,
        "n_estimators": hyperparams.n_estimators,
        "max_depth": hyperparams.max_depth,
        "learning_rate": hyperparams.learning_rate,
        "subsample": hyperparams.subsample,
        "colsample_bytree": hyperparams.colsample_bytree,
        "min_child_weight": hyperparams.min_child_weight,
    }
    # Remove keys that are not xgb constructor params
    params.pop("objective", None)
    params.pop("random_state", None)

    models: dict[str, Any] = {}
    for target in HRV_TARGETS:
        y = np.array([getattr(c.delta, target) for c in cases], dtype=np.float32)

        regressor = xgb.XGBRegressor(
            objective="reg:squarederror",
            random_state=42,
            feature_names=FEATURE_NAMES,
            **params,
        )
        regressor.fit(X, y)

        raw = regressor.get_booster().save_raw(raw_format="json")
        models[target] = json.loads(raw)

    return models


def predict(models_json: dict[str, Any], cases: list[PredictCase]) -> list[HRVDelta]:
    """
    Run inference for each case using the provided model JSONs.
    Returns a list of predicted HRV deltas.
    """
    X = np.array([c.features for c in cases], dtype=np.float32)

    preds: dict[str, np.ndarray] = {}
    for target in HRV_TARGETS:
        booster = xgb.Booster()
        raw = json.dumps(models_json[target]).encode("utf-8")
        booster.load_model(bytearray(raw))
        dmatrix = xgb.DMatrix(X, feature_names=FEATURE_NAMES)
        preds[target] = booster.predict(dmatrix)

    return [
        HRVDelta(
            hr=float(preds["hr"][i]),
            rmssd=float(preds["rmssd"][i]),
            sdnn=float(preds["sdnn"][i]),
            pnn50=float(preds["pnn50"][i]),
            lf=float(preds["lf"][i]),
            hf=float(preds["hf"][i]),
        )
        for i in range(len(cases))
    ]
