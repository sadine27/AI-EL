# 🚗 Smart Parking AI — Onboarding Guide

Welcome to the team! You're joining a project that predicts **where parking spots are available** in real time — like having a crystal ball for parking! 🎯

## What Does This Project Do? (In Plain English)

Imagine you're driving downtown and need to park. You don't want to circle around for 20 minutes, right? This system helps solve that problem.

**Here's how it works:**

1. **We collect data** from Google Maps (weather, traffic, nearby shops, air quality, and 30+ other signals)
2. **Our AI engine** (written in C++) analyzes all that data and predicts how many parking spots are likely free
3. **A web dashboard** shows you the prediction — green means easy parking, red means good luck finding a spot!

The AI uses **four different models** (like having four experts give their opinion) and combines them for the best answer.

## Project Structure (The Big Picture)

```
smart-parking-cpp/
├── cpp-engine/          # The brain — C++ AI models (fast!)
├── python-api/          # The senses — collects data from Google
├── frontend/            # The face — what users see
├── scripts/             # Helper tools
├── Dockerfile           # How to package everything
└── docker-compose.yml   # How to run everything together
```

**Think of it like a restaurant:**
- **Python API** = the waiters (gathering ingredients from Google)
- **C++ Engine** = the chef (cooking up predictions)
- **Frontend** = the menu (showing customers what's available)

## How to Set Up and Run

### Option 1: Docker (Easiest — Recommended)

```bash
# 1. Get the code
git clone <your-repo-url>
cd smart-parking-cpp

# 2. Set your Google API key (ask a teammate for this)
export GOOGLE_MAPS_API_KEY="your-api-key-here"

# 3. Build and run everything
docker compose up --build
```

Then open **http://localhost:8080** in your browser. You should see the dashboard!

### Option 2: Run Locally (For Development)

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Start the Python API (this also serves the frontend)
cd python-api
python main.py

# 3. Open http://localhost:8080
```

*Note: Without Docker, the C++ engine won't run. The Python API has a fallback mode for testing.*

## Division of Work — Pick Your Role!

### 🧠 Team A: C++ AI Engine (2–3 people)

**What you build:** The core prediction models — the "brain" of the system.

**Your files:** `cpp-engine/src/*.cpp` and `cpp-engine/include/*.h`

**Concrete tasks:**
- **Decision Tree** (`decision_tree.cpp`): Make rules like "if it's raining AND rush hour → high demand"
- **Bayesian Model** (`bayesian_model.cpp`): Calculate probabilities (e.g., "70% chance parking is full")
- **KNN (Instance Learning)** (`instance_learning.cpp`): Compare current conditions to past data
- **Neural Network** (`neural_model.cpp`): A simple brain-like calculation
- **A* Search** (`search_model.cpp`): Rank parking spots by distance
- **Feature Extractor** (`feature_extractor.cpp`): Convert raw data into numbers the AI can use

**Skills you'll learn:** C++17, algorithms, probability, machine learning basics

### 🌐 Team B: Python API & Collectors (2–3 people)

**What you build:** The "senses" — talking to Google Maps APIs and feeding data to the C++ engine.

**Your files:** `python-api/collectors/*.py` and `python-api/main.py`

**Concrete tasks:**
- **Places Collector** (`places.py`): Get nearby shops/restaurants (more shops = more demand)
- **Weather Collector** (`weather.py`): Get rain, temperature, wind
- **Environment Collector** (`environment.py`): Air quality, pollen levels
- **Geolocation Collector** (`geolocation.py`): Time zone, elevation
- **Routing Collector** (`routing.py`): Traffic, distances, routes
- **API Server** (`main.py`): Connect everything together, handle requests

**Skills you'll learn:** Python, FastAPI, REST APIs, async programming, JSON

### 🎨 Team C: Frontend (1–2 people)

**What you build:** The user interface — what people see and interact with.

**Your files:** `frontend/*`

**Concrete tasks:**
- **Dashboard** (`index.html`): Main page with map and predictions
- **Styling** (`css/styles.css`): Make it look good (green/yellow/red indicators)
- **Interactivity** (`js/app.js`): Buttons, animations, real-time updates
- **Map Integration**: Show parking spots on a map
- **Responsive Design**: Works on phones too!

**Skills you'll learn:** HTML, CSS, JavaScript, web design, Google Maps API

### 🛠️ Team D: DevOps & Testing (1–2 people)

**What you build:** The infrastructure — making sure everything runs smoothly.

**Your files:** `Dockerfile`, `docker-compose.yml`, `scripts/`, tests

**Concrete tasks:**
- **Docker Setup**: Package the C++ engine and Python API together
- **CI/CD Pipeline**: Auto-test and deploy when code changes
- **Testing**: Write tests for all components
- **Monitoring**: Track errors and performance
- **Documentation**: Keep this guide updated!

**Skills you'll learn:** Docker, CI/CD, testing, Linux, bash scripting

## Suggested 4-Week Timeline

### Week 1: Foundation 🏗️
- **Everyone**: Set up development environment, read the codebase
- **Team A**: Get C++ engine compiling, implement basic decision tree
- **Team B**: Get Python API running, implement 1–2 collectors
- **Team C**: Create basic HTML page with a map
- **Team D**: Set up Docker, write first tests

### Week 2: Core Features 🔧
- **Team A**: Implement Bayesian and KNN models
- **Team B**: Add all 5 collector groups, connect to C++ engine
- **Team C**: Add prediction display, styling
- **Team D**: Set up CI/CD, write integration tests

### Week 3: Integration & Polish 🎨
- **Everyone**: Connect all components end-to-end
- **Team A**: Neural network and A* search
- **Team B**: Error handling, caching
- **Team C**: Animations, mobile-friendly
- **Team D**: Performance testing, security hardening

### Week 4: Launch 🚀
- **Everyone**: Bug fixes, final testing
- **Team A**: Optimize model accuracy
- **Team B**: Add remaining Google APIs (all 33!)
- **Team C**: User testing, final polish
- **Team D**: Deploy to production, write final docs

## Tips for Success 🌟

1. **Ask questions!** No question is too small. We were all beginners once.
2. **Start small** — get one thing working before adding more.
3. **Use Git** — commit often with clear messages.
4. **Read the code** — the existing code has comments explaining everything.
5. **Pair up** — work with someone from another team to understand connections.
6. **Have fun!** This is a real project that could help real people.

## Need Help?

- Check the `README.md` for technical details
- Look at existing code for examples
- Ask in the team chat — someone's always around!

**Welcome aboard! Let's build something awesome together! 🚗✨**