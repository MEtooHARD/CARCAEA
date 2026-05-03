"""
API routes for the ML server.
"""

import logging
from fastapi import APIRouter
from schemas import TrainRequest, TrainResponse, PredictRequest, PredictResponse
from trainer import train_models, predict

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/train", response_model=TrainResponse, tags=["ml"])
async def train(req: TrainRequest) -> TrainResponse:
    """
    Train 6 XGBoost regressors (one per HRV delta target) from the provided cases.
    Returns XGBoost JSON model representations and the feedback IDs used.
    """
    logger.info(f"Training with {len(req.cases)} cases")
    models = train_models(req.cases, req.hyperparams)
    case_ids = [c.feedback_id for c in req.cases]
    logger.info("Training complete")
    return TrainResponse(models=models, case_ids=case_ids)


@router.post("/predict", response_model=PredictResponse, tags=["ml"])
async def predict_delta(req: PredictRequest) -> PredictResponse:
    """
    Predict HRV delta for each case using the provided model JSONs.
    """
    predictions = predict(req.models, req.cases)
    return PredictResponse(predictions=predictions)
