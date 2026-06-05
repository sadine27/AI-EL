"""Prediction model — ensembles C++ engine result with fallback logic."""


def ensemble_predict(
    cpp_result: dict | None,
    fallback_result: dict | None
) -> dict:
    """Combine C++ engine result with Python fallback.
    
    Edge cases handled:
    - Both results are None -> returns error dict
    - cpp_result missing required keys -> falls back
    - fallback_result empty -> returns C++ only or error
    """
    # Prefer C++ result if available and has required fields
    if cpp_result and isinstance(cpp_result, dict):
        if "predictedAvailable" in cpp_result:
            return {**cpp_result, "engine": "cpp"}
    if fallback_result and isinstance(fallback_result, dict):
        return {**fallback_result, "engine": "python-fallback"}
    return {"error": "No prediction available", "engine": "none",
            "predictedAvailable": 0, "predictedOccupancyPct": 0,
            "riskLabel": "Unknown", "demandLabel": "Unknown",
            "confidencePct": 0}
