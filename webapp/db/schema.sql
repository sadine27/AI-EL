CREATE DATABASE IF NOT EXISTS smart_parking;
USE smart_parking;
CREATE TABLE IF NOT EXISTS parking_lots (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, lat DOUBLE NOT NULL, lng DOUBLE NOT NULL, total_slots INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS predictions (id INT AUTO_INCREMENT PRIMARY KEY, lat DOUBLE, lng DOUBLE, total_slots INT, unavailable INT, hour INT, day_of_week INT, predicted_available INT, predicted_occupancy_pct DOUBLE, risk_label VARCHAR(50), demand_label VARCHAR(50), confidence_pct DOUBLE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO parking_lots (name, lat, lng, total_slots) VALUES ('Phoenix Marketcity Kurla', 19.0760, 72.8777, 500);
INSERT INTO parking_lots (name, lat, lng, total_slots) VALUES ('Infinity Mall Malad', 19.1860, 72.8490, 400);
INSERT INTO parking_lots (name, lat, lng, total_slots) VALUES ('Chhatrapati Shivaji Terminus', 18.9398, 72.8355, 200);
INSERT INTO parking_lots (name, lat, lng, total_slots) VALUES ('Juhu Beach Parking', 19.0880, 72.8260, 150);
INSERT INTO parking_lots (name, lat, lng, total_slots) VALUES ('Bandra Kurla Complex', 19.0630, 72.8680, 300);