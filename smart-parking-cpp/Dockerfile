# ============================================================
# Stage 1: Build C++ Engine
# ============================================================
FROM gcc:14.2.0 AS cpp-builder

WORKDIR /build

# Install CMake
RUN apt-get update && apt-get install -y cmake libcurl4-openssl-dev nlohmann-json3-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy C++ source
COPY cpp-engine/ ./cpp-engine/

WORKDIR /build/cpp-engine/build
RUN cmake .. && cmake --build . --target parking-engine -j$(nproc)

# ============================================================
# Stage 2: Python + Runtime (distroless-like slim)
# ============================================================
FROM python:3.12-slim

# Security: Create non-root user
RUN groupadd -r parking && useradd -r -g parking -d /app -s /sbin/nologin parking

WORKDIR /app

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 && \
    rm -rf /var/lib/apt/lists/*

# Copy C++ engine binary
COPY --from=cpp-builder --chown=parking:parking /build/cpp-engine/build/parking-engine ./cpp-engine/parking-engine

# Copy Python API
COPY --chown=parking:parking python-api/ ./python-api/
COPY --chown=parking:parking requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend
COPY --chown=parking:parking frontend/ ./frontend/

# Security: Set restrictive permissions
RUN chmod -R 750 /app && \
    chmod 640 /app/requirements.txt

# Security: Drop root privileges
USER parking

# Expose ports
EXPOSE 8080
EXPOSE 5001

# Security: Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

# Default: start both C++ engine and Python API
# Use exec form for proper signal handling
CMD ["python", "-m", "uvicorn", "python-api.main:app", "--host", "0.0.0.0", "--port", "8080"]
