#include <iostream>
#include <string>
#include <cstring>
#include <cstdlib>
#include <thread>
#include <sstream>
#include <fstream>
#include <algorithm>
#include <nlohmann/json.hpp>

#include "ai_utils.h"
#include "feature_extractor.h"
#include "decision_tree.h"
#include "bayesian_model.h"
#include "instance_learning.h"
#include "neural_model.h"
#include "search_model.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#endif

using json = nlohmann::json;

namespace parking {

// ------------------------------------------------------------
// Thread safety — maximum concurrent clients
// ------------------------------------------------------------
const int MAX_THREADS = 32;
std::atomic<int> active_threads{0};

// ------------------------------------------------------------
// Parse prediction request from JSON
// ------------------------------------------------------------
FeatureVector parseRequest(const json& body) {
    // Safe extraction with defaults for all fields
    int totalSlots = body.value("totalSlots", 10);
    int unavailable = body.value("unavailable", 3);
    int hour = body.value("hour", 12);
    int dayOfWeek = body.value("dayOfWeek", 3);

    // Clamp values to valid ranges
    totalSlots = std::max(1, std::min(1000, totalSlots));
    unavailable = std::max(0, std::min(totalSlots, unavailable));
    hour = std::max(0, std::min(23, hour));
    dayOfWeek = std::max(0, std::min(6, dayOfWeek));

    std::vector<Place> places;
    if (body.contains("places") && body["places"].is_array()) {
        for (const auto& p : body["places"]) {
            if (!p.is_object()) continue;
            Place place;
            place.name = p.value("name", "Place");
            place.type = p.value("type", "store");
            place.open = p.value("open", true);
            place.rating = std::max(0.0, p.value("rating", 0.0));
            place.reviewCount = std::max(0, p.value("reviewCount", 0));
            place.lat = clamp(p.value("lat", 0.0), -90.0, 90.0);
            place.lng = clamp(p.value("lng", 0.0), -180.0, 180.0);
            places.push_back(place);
        }
    }

    EnvironmentData env;
    if (body.contains("environment") && body["environment"].is_object()) {
        const auto& e = body["environment"];
        env.precipitationProb = clamp(e.value("precipitationProb", 0.0));
        env.thunderstormProb = clamp(e.value("thunderstormProb", 0.0));
        env.visibilityKm = std::max(0.0, e.value("visibilityKm", 16.0));
        env.cloudCover = clamp(e.value("cloudCover", 0.0));
        env.windSpeed = std::max(0.0, e.value("windSpeed", 0.0));
        env.aqi = std::max(0, e.value("aqi", 0));
        env.pollenScore = std::max(0.0, e.value("pollenScore", 0.0));
    }

    RouteData route;
    if (body.contains("route") && body["route"].is_object()) {
        const auto& r = body["route"];
        route.distanceMeters = std::max(0.0, r.value("distanceMeters", 0.0));
        route.durationSeconds = std::max(0.0, r.value("durationSeconds", 0.0));
        route.roadMatched = r.value("roadMatched", false);
    }

    std::vector<HistoricalRow> historical;
    if (body.contains("historical") && body["historical"].is_array()) {
        for (const auto& h : body["historical"]) {
            if (!h.is_object()) continue;
            HistoricalRow row;
            row.hour = std::max(0, std::min(23, h.value("hour", 12)));
            row.day = std::max(0, std::min(6, h.value("day", 3)));
            row.weekend = h.value("weekend", 0) ? 1 : 0;
            row.peakHour = h.value("peakHour", 0) ? 1 : 0;
            row.durationMinutes = std::max(0.0, h.value("durationMinutes", 45.0));
            row.occupiedShare = clamp(h.value("occupiedShare", 0.0));
            row.key = std::to_string(row.day) + "-" + std::to_string(row.hour);
            historical.push_back(row);
        }
    }

    FeatureVector fv = buildFeatureVector(totalSlots, unavailable, places, env, route, historical, hour, dayOfWeek);

    // For backward compatibility
    fv.placeCount = static_cast<int>(places.size());
    fv.rows = historical;
    fv.historicalRowCount = static_cast<int>(historical.size());

    return fv;
}

// ------------------------------------------------------------
// Build prediction result JSON
// ------------------------------------------------------------
json buildPredictionJson(const FeatureVector& fv) {
    auto [dtLabel, dtScore] = decisionTreeRisk(fv);
    double bayes = bayesianPressure(fv);
    InstanceResult instance = instanceBasedPressure(fv, 5);
    double neural = neuralPressureScore(fv);

    // Ensemble formula (same as JS)
    double predictedOccupancyRatio = clamp(
        fv.liveOccupancyRatio * 0.32 +
        fv.demandScore * 0.20 +
        fv.historicalPressure * 0.14 +
        fv.environmentScore * 0.09 +
        fv.routeScore * 0.08 +
        dtScore * 0.07 +
        bayes * 0.04 +
        instance.score * 0.03 +
        neural * 0.03
    );

    int predictedAvailable = std::max(0,
        std::min(fv.totalSlots,
            static_cast<int>(std::round(fv.totalSlots * (1.0 - predictedOccupancyRatio)))));

    // Confidence calculation (simplified responsible AI)
    double dataCompleteness = clamp(
        0.32 +
        std::min(fv.placeCount, 8) * 0.035 +
        std::min(fv.historicalRowCount, 12) * 0.016 +
        (fv.totalSlots > 0 ? 0.16 : 0.0)
    );

    // Demand label
    std::string demandLabel = (fv.demandScore >= 0.70) ? "Heavy" :
                              (fv.demandScore >= 0.42) ? "Moderate" : "Light";

    json result;
    result["predictedAvailable"] = predictedAvailable;
    result["predictedOccupancyPct"] = static_cast<int>(std::round(predictedOccupancyRatio * 100));
    result["riskLabel"] = dtLabel;
    result["demandLabel"] = demandLabel;
    result["demandScore"] = fv.demandScore;
    result["confidencePct"] = static_cast<int>(std::round(dataCompleteness * 100));
    result["horizonMinutes"] = 30;
    result["liveAvailable"] = fv.liveAvailable;

    result["modelBreakdown"]["decisionTree"] = dtLabel;
    result["modelBreakdown"]["decisionTreeScore"] = static_cast<int>(std::round(dtScore * 100));
    result["modelBreakdown"]["bayes"] = static_cast<int>(std::round(bayes * 100));
    result["modelBreakdown"]["instance"] = static_cast<int>(std::round(instance.score * 100));
    result["modelBreakdown"]["instanceNeighbors"] = instance.neighbors;
    result["modelBreakdown"]["neural"] = static_cast<int>(std::round(neural * 100));
    result["modelBreakdown"]["environment"] = static_cast<int>(std::round(fv.environmentScore * 100));
    result["modelBreakdown"]["routeAccess"] = static_cast<int>(std::round(fv.routeScore * 100));

    return result;
}

// ------------------------------------------------------------
// Simple HTTP server
// ------------------------------------------------------------
std::string readFile(const std::string& path) {
    // Edge case: prevent path traversal
    if (path.find("..") != std::string::npos || path.find("/") != std::string::npos) {
        return "";
    }
    std::ifstream file(path);
    if (!file) return "";
    std::stringstream ss;
    ss << file.rdbuf();
    return ss.str();
}

std::string buildResponse(const std::string& body, const std::string& contentType = "application/json", int statusCode = 200) {
    std::string status = (statusCode == 200) ? "200 OK" :
                         (statusCode == 400) ? "400 Bad Request" :
                         (statusCode == 404) ? "404 Not Found" :
                         "500 Internal Server Error";
    std::string corsOrigin = getCorsOrigin();
    return "HTTP/1.1 " + status + "\r\n"
           "Content-Type: " + contentType + "\r\n"
           "Content-Length: " + std::to_string(body.size()) + "\r\n"
           "Access-Control-Allow-Origin: " + corsOrigin + "\r\n"
           "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
           "Access-Control-Allow-Headers: Content-Type\r\n"
           "Access-Control-Allow-Credentials: true\r\n"
           "Connection: close\r\n"
           "\r\n" + body;
}

// CORS origin — configurable via environment variable
std::string getCorsOrigin() {
    const char* envOrigin = std::getenv("CPP_CORS_ORIGIN");
    if (envOrigin && std::strlen(envOrigin) > 0) {
        return std::string(envOrigin);
    }
    return "http://localhost:8080";
}

std::string readFullBody(int clientFd) {
    std::string body;
    char chunk[4096];
    int totalRead = 0;
    const int MAX_BODY = 1024 * 1024; // 1MB max body size

    while (totalRead < MAX_BODY) {
        int n = recv(clientFd, chunk, sizeof(chunk) - 1, 0);
        if (n <= 0) break;
        chunk[n] = '\0';
        body += chunk;
        totalRead += n;
        // Check if we've read the full body (headers included)
        auto bodyPos = body.find("\r\n\r\n");
        if (bodyPos != std::string::npos) {
            // We have headers, check if we have content-length worth of body
            auto clPos = body.find("Content-Length:");
            if (clPos != std::string::npos) {
                auto end = body.find("\r\n", clPos);
                std::string lenStr = body.substr(clPos + 15, end - clPos - 15);
                int contentLength = std::atoi(lenStr.c_str());
                int headerEnd = bodyPos + 4;
                int bodyLen = totalRead - headerEnd;
                if (bodyLen >= contentLength) break;
            } else {
                break; // No content-length, assume one chunk is enough
            }
        }
    }
    return body;
}

void handleClient(int clientFd) {
    // Check thread limit
    int current = ++active_threads;
    if (current > MAX_THREADS) {
        --active_threads;
        json error;
        error["error"] = "Server busy, too many concurrent requests";
        std::string resp = buildResponse(error.dump(), "application/json", 503);
        send(clientFd, resp.c_str(), resp.size(), 0);
#ifdef _WIN32
        closesocket(clientFd);
#else
        close(clientFd);
#endif
        return;
    }

    std::string request;
    try {
        request = readFullBody(clientFd);
    } catch (...) {
        request.clear();
    }

    std::string response;

    if (request.empty()) {
        json error;
        error["error"] = "Empty request";
        response = buildResponse(error.dump(), "application/json", 400);
    } else {
        // Parse request line
        std::istringstream reqStream(request);
        std::string method, path, httpVersion;
        reqStream >> method >> path >> httpVersion;

        // Handle CORS preflight
        if (method == "OPTIONS") {
            response = buildResponse("{}");
        }
        // Handle prediction endpoint
        else if (path == "/predict" && method == "POST") {
            // Extract body
            auto bodyPos = request.find("\r\n\r\n");
            if (bodyPos == std::string::npos) {
                json error;
                error["error"] = "No body found";
                response = buildResponse(error.dump(), "application/json", 400);
            } else {
                std::string body = request.substr(bodyPos + 4);
                if (body.empty()) {
                    json error;
                    error["error"] = "Empty body";
                    response = buildResponse(error.dump(), "application/json", 400);
                } else {
                    try {
                        json reqJson = json::parse(body);
                        if (!reqJson.is_object()) {
                            json error;
                            error["error"] = "Body must be a JSON object";
                            response = buildResponse(error.dump(), "application/json", 400);
                        } else {
                            FeatureVector fv = parseRequest(reqJson);
                            json result = buildPredictionJson(fv);
                            response = buildResponse(result.dump(2));
                        }
                    } catch (const json::parse_error& e) {
                        json error;
                        error["error"] = std::string("JSON parse error: ") + e.what();
                        response = buildResponse(error.dump(), "application/json", 400);
                    } catch (const std::exception& e) {
                        json error;
                        error["error"] = std::string("Parse error: ") + e.what();
                        response = buildResponse(error.dump(), "application/json", 400);
                    }
                }
            }
        }
        // Health check
        else if (path == "/health") {
            json health;
            health["status"] = "ok";
            health["engine"] = "parking-engine v1.0.0";
            health["models"] = {"decision_tree", "bayesian", "knn", "neural", "search"};
            response = buildResponse(health.dump());
        }
        else {
            json error;
            error["error"] = "Not found";
            error["path"] = path;
            error["method"] = method;
            response = buildResponse(error.dump(), "application/json", 404);
        }
    }

    try {
        send(clientFd, response.c_str(), response.size(), 0);
    } catch (...) {
        // Silently ignore send errors
    }

#ifdef _WIN32
    closesocket(clientFd);
#else
    close(clientFd);
#endif

    --active_threads;
}

} // namespace parking

// ------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------
int main() {
    using namespace parking;

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "WSAStartup failed" << std::endl;
        return 1;
    }
#endif

    int port = 5001;
    const char* envPort = std::getenv("CPP_ENGINE_PORT");
    if (envPort) port = std::atoi(envPort);
    port = std::max(1024, std::min(65535, port)); // Use privileged ports in valid range

    int serverFd = socket(AF_INET, SOCK_STREAM, 0);
    if (serverFd < 0) {
        std::cerr << "Failed to create socket" << std::endl;
        return 1;
    }

    int opt = 1;
#ifdef _WIN32
    setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
    setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port);

    if (bind(serverFd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Bind failed on port " << port << std::endl;
        return 1;
    }

    if (listen(serverFd, 10) < 0) {  // Increase backlog
        std::cerr << "Listen failed" << std::endl;
        return 1;
    }

    std::cout << "C++ Parking Engine listening on port " << port << std::endl;
    std::cout << "Models available: decision_tree, bayesian, knn, neural, search" << std::endl;

    while (true) {
        struct sockaddr_in clientAddr;
        socklen_t addrLen = sizeof(clientAddr);
        int clientFd = accept(serverFd, (struct sockaddr*)&clientAddr, &addrLen);
        if (clientFd < 0) {
            std::cerr << "Accept failed" << std::endl;
            continue;
        }
        // Set socket timeout on client socket to prevent hung connections
#ifdef _WIN32
        int timeout = 10000; // 10 seconds
        setsockopt(clientFd, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
#else
        struct timeval tv;
        tv.tv_sec = 10;
        tv.tv_usec = 0;
        setsockopt(clientFd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif
        std::thread(handleClient, clientFd).detach();
    }

#ifdef _WIN32
    closesocket(serverFd);
    WSACleanup();
#else
    close(serverFd);
#endif

    return 0;
}
