import app as flask_app


def test_api_health_reports_not_ready(client, app):
    app.config["ENABLE_API_HEALTH_CHECK"] = True
    flask_app.STARTUP_STATUS.update({"status": "running", "message": "Booting"})

    response = client.get("/api/health")

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["ready"] is False
    assert payload["startup_status"] == "running"


def test_api_endpoints_blocked_until_ready(client, app):
    app.config["ENABLE_API_HEALTH_CHECK"] = True
    flask_app.STARTUP_STATUS.update({"status": "starting", "message": "Initializing"})

    response = client.get("/api/cases")

    assert response.status_code == 503
    payload = response.get_json()
    assert payload["error"] == "Service is not ready yet"
    assert payload["startup_status"] == "starting"


def test_api_endpoints_allowed_when_ready(client, app):
    app.config["ENABLE_API_HEALTH_CHECK"] = True
    flask_app.STARTUP_STATUS.update({"status": "completed", "message": "Ready"})

    response = client.get("/api/cases")

    assert response.status_code == 200
