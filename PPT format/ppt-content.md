# PPT Content: Smart Parking Availability Prediction using Explainable AI

This file contains ready-to-place content for the 12-slide PPT format present in this folder. Keep each slide concise in the actual presentation; use the speaker notes only while presenting.

## Slide 1: Project Title

**Title**

Smart Parking Availability Prediction using Explainable AI

**Student Details**

| Student Name | USN |
| --- | --- |
| Student Name 1 | USN 1 |
| Student Name 2 | USN 2 |
| Student Name 3 | USN 3 |
| Student Name 4 | USN 4 |

**Under the Guidance of**

Faculty Name,  
Designation,  
Department of XXX,  
RVCE, Bengaluru

**Speaker Notes**

This project is an AI Foundations for Engineers course project. It builds a browser-based smart parking system that predicts near-future parking availability using live slot state, historical logs, nearby place activity, route/access context, time, weather, and explainable AI models.

## Slide 2: Agenda

- Problem Statement
- Motivation and Relevance
- Literature Study
- Research Gap
- Need for AI/ML Integration
- AI/ML Paradigm Mapping
- Innovation and Originality
- Potential Dataset Sources
- References

**Speaker Notes**

The presentation follows the college PPT format and focuses on why parking prediction is a real-world AI problem, what existing work covers, what gap remains, and how this project addresses it through explainable AI and a working web prototype.

## Slide 3: Problem Statement

- Urban drivers waste time searching for parking in crowded areas.
- Parking availability changes due to:
  - Current slot occupancy
  - Peak hours and day-of-week patterns
  - Nearby shops, colleges, hospitals, malls, and restaurants
  - Weather and walking comfort
  - Road access and route difficulty
  - Previous parking behavior
- The project predicts short-term slot availability near a selected area.
- Target users: drivers, parking-area operators, colleges, malls, hospitals, and local administrators.

**Focused Problem**

Can an AI agent estimate parking availability near a selected area by observing nearby shops, road access, weather, time, and previous parking behavior?

**Speaker Notes**

The problem is not only to show currently free slots. A driver needs to know whether a slot is likely to remain available by the time they reach the parking area. That makes the problem dynamic and uncertain.

## Slide 4: Motivation and Relevance

- Reduces time spent searching for parking.
- Helps reduce traffic congestion caused by vehicles circling for slots.
- Improves user convenience in busy urban locations.
- Supports better parking-area management.
- Encourages data-driven decisions instead of manual guessing.
- Relevant to:
  - Societal mobility
  - Urban transport efficiency
  - Environmental impact through reduced fuel waste
  - Technological smart-city development

**Practical Scenario**

A driver near a mall or college can view nearby parking areas and see an explainable area-level prediction of availability risk before navigating to one.

**Speaker Notes**

If the problem is not addressed, users continue depending on trial-and-error parking search. This causes frustration, delays, congestion, and inefficient use of existing parking capacity.

## Slide 5: Literature Study

| Study | Approach Used | Key Limitation |
| --- | --- | --- |
| Awan et al. (2020), Sensors | Compared ML and deep learning models for parking space availability prediction | Focuses mainly on model comparison; explainability and user-facing reasoning are limited |
| Di Martino and Origlia (2020), Electronics | Used recurring parking patterns to improve prediction scalability | Depends strongly on historical patterns and may not capture live local context fully |
| Dia et al. (2022), Network | Evaluated ML and neural network algorithms for AIoT-based parking segment availability | Segment-level prediction may not provide slot-level user guidance |
| Feng et al. (2022), Complex and Intelligent Systems | Proposed hybrid deep learning for zone-wise vacant parking prediction | Deep models can be harder to explain to end users |
| Dahiya et al. (2024), Journal of Advanced Transportation | Evaluated models such as KNN, SVM, random forest, decision tree, logistic regression, and Naive Bayes | IoT-oriented setup assumes sensor-rich environments |
| Cao et al. (2024), Transportmetrica A | Surveyed ML techniques, datasets, features, metrics, and limitations for parking forecasting | Survey highlights need for context-aware and more interpretable future systems |

**Speaker Notes**

Existing work confirms that parking prediction is a valid AI/ML problem. Most systems focus on model accuracy, sensor data, or time-series forecasting. This project adapts those ideas into an explainable browser-based prototype suitable for a course project and demo.

## Slide 6: Research Gap

- Existing approaches often require large real-world sensor datasets.
- Many models predict occupancy but do not clearly explain why.
- Some solutions focus on zones or road segments and still cannot guarantee real-time individual-spot availability.
- Exact Google Maps popular-times data is not available through public APIs.
- Browser-based prototypes must handle missing APIs and security limitations.
- Practical systems need both prediction and route-aware parking guidance.

**Gap Addressed By This Project**

This project combines live slot state, historical logs, nearby place demand, route/access context, weather/environment signals, and explainable AI scoring to produce both prediction and recommendation.

**Speaker Notes**

The main gap is the combination of practical usability and explainability. A user should not only see "parking likely full"; they should also understand whether that result came from live occupancy, nearby demand, time, route difficulty, or limited data confidence.

## Slide 7: Need for AI/ML Integration

- Traditional rule-based parking display is insufficient because:
  - It only shows the present state.
  - It cannot estimate future occupancy.
  - It does not combine multiple uncertain signals.
  - It cannot learn from history.
- AI/ML is needed for:
  - Pattern recognition from time and historical behavior
  - Data-driven prediction of near-future availability
  - Slot recommendation using search-style scoring
  - Confidence and explanation generation
  - Fallback prediction when some APIs are unavailable

**Why AI/ML Is Necessary**

Parking availability is uncertain, dynamic, and context-dependent. AI/ML allows the system to combine multiple weak signals into a useful prediction.

**Speaker Notes**

The project uses explainable AI rather than a single black-box model. This is important for an academic project because each AI component can be mapped to the syllabus and explained during evaluation.

## Slide 8: AI/ML Paradigm Mapping

| Paradigm | Project Mapping | Suitability |
| --- | --- | --- |
| Intelligent Agent | Observes parking state, APIs, location, and history; acts by predicting and recommending | Fits AI agent concepts from Unit 1 |
| Search / Optimization | Ranks parking areas and free slots using route/access and occupancy cost | Helps choose the most suitable slot |
| Classification | Decision tree classifies risk as low, medium, or high | Easy to explain in PPT/demo |
| Probability / Bayesian Learning | Bayesian pressure model estimates occupancy pressure from evidence | Handles uncertainty from incomplete signals |
| Instance-Based Learning | KNN-style comparison with previous parking cases | Learns from similar past situations |
| Neural-Style Scoring | Single-layer sigmoid score combines weighted features | Demonstrates neural-network concept without overcomplexity |
| Responsible AI | Confidence, source labels, fallback explanation, and limitations | Avoids false certainty |

**Speaker Notes**

The project uses an ensemble-style explainable model. Instead of depending on one method, it combines decision tree, Bayesian pressure, instance-based learning, neural scoring, live occupancy, and contextual signals.

## Slide 9: Innovation and Originality

- Combines a working smart parking web app with explainable AI.
- Separates AI logic into modular files under `js/ai/`.
- Uses Google Maps Platform APIs as optional signal sources instead of forcing every API call.
- Infers nearby demand from available public data such as:
  - Nearby places
  - Opening status
  - Review/rating signals
  - Distance and route context
  - Time and day features
- Provides prediction confidence and explanation.
- Includes fallback behavior when live APIs are unavailable.
- Includes security hardening:
  - API keys excluded from Git
  - `.env.example` and runtime config template
  - Safer local static server path handling
  - TLS 1.2 for secure local server

**Speaker Notes**

The originality is in integrating course AI concepts with a complete demo application. The system is not just a theoretical model; it includes parking-area creation, slot generation, live status simulation, logs, and AI prediction. The project deliberately removes booking and specific-spot allocation because the model predicts availability rather than confirming a physical spot.

## Slide 10: Potential Dataset Sources

| Source | Type of Data | Use in Project |
| --- | --- | --- |
| Browser/local app data | Parking areas, slot status, and occupancy logs | Live occupancy and history |
| Simulated sensor updates | Occupied/free slot state | Demo-ready real-time changes |
| Google Places API | Nearby shops, institutions, ratings, review count, opening status | Demand estimation |
| Google Geocoding/Geolocation APIs | Coordinates and locality context | Area lookup and nearby discovery |
| Google Routes/Distance Matrix/Roads APIs | Travel time, route effort, road access | Search cost and slot ranking |
| Google Weather/Air Quality/Pollen APIs | Weather and environmental comfort | Contextual pressure features |
| Public datasets such as Kaggle or city open-data portals | Historical parking occupancy and smart-city traffic data | Future model training and evaluation |

**Feasibility**

- Current prototype can use local demo data and browser storage.
- Live API signals are optional and depend on a restricted Google Cloud key.
- More real parking logs are needed for stronger quantitative evaluation.

**Speaker Notes**

The project is designed to work even without a large external dataset. However, for future evaluation, public parking datasets and real parking-area logs can be used to calculate accuracy, mean absolute error, and confidence calibration.

## Slide 11: References

Use one consistent APA-style format in the final PPT.

- Awan, F. M., Saleem, Y., Minerva, R., & Crespi, N. (2020). A comparative analysis of machine/deep learning models for parking space availability prediction. *Sensors, 20*(1), 322. https://doi.org/10.3390/s20010322
- Cao, R., Choudhury, F., Winter, S., & Wang, D. Z. W. (2024). Artificial intelligence for parking forecasting: An extensive survey of machine learning techniques. *Transportmetrica A: Transport Science*. https://doi.org/10.1080/23249935.2024.2409229
- Dahiya, A., Mittal, P., Sharma, Y. K., Lilhore, U., Simaiya, S., Ghith, E., & Tlija, M. (2024). Machine learning-based prediction of parking space availability in IoT-enabled smart parking management systems. *Journal of Advanced Transportation, 2024*, 8474973. https://doi.org/10.1155/2024/8474973
- Dia, I., Ahvar, E., & Lee, G. M. (2022). Performance evaluation of machine learning and neural network-based algorithms for predicting segment availability in AIoT-based smart parking. *Network, 2*(2), 225-238. https://doi.org/10.3390/network2020015
- Di Martino, S., & Origlia, A. (2020). Exploiting recurring patterns to improve scalability of parking availability prediction systems. *Electronics, 9*(5), 838. https://doi.org/10.3390/electronics9050838
- Feng, Y., Xu, Y., Hu, Q., Krishnamoorthy, S., & Tang, Z. (2022). Predicting vacant parking space availability zone-wisely: A hybrid deep learning approach. *Complex and Intelligent Systems, 8*, 4145-4161. https://doi.org/10.1007/s40747-022-00700-1
- Russell, S., & Norvig, P. (2020). *Artificial Intelligence: A Modern Approach* (4th ed.). Pearson.
- Mitchell, T. M. (1997). *Machine Learning*. McGraw-Hill.
- NASSCOM. *Responsible AI Architect's Guide: Responsible AI Best Practices*.
- Google Maps Platform documentation. https://developers.google.com/maps

**Speaker Notes**

The references include recent parking prediction studies, core AI textbooks, responsible AI material, and Google Maps Platform documentation used for API signal planning.

## Slide 12: Thank You

**Thank You**

Questions?

**Optional Closing Line**

This project demonstrates how explainable AI can support smarter, more transparent, and user-friendly parking decisions.

## Optional Backup Slide: System Architecture

Use this slide only if extra slides are allowed.

```text
User Interface
  -> Parking Area and Slot Data Store
  -> Google/API Signal Collection
  -> Feature Extraction Layer
  -> Explainable AI Model Layer
       -> Decision Tree
       -> Bayesian Pressure
       -> Instance-Based Learning
       -> Neural-Style Score
       -> Search-Based Slot Recommendation
  -> Responsible AI Explanation
  -> User Prediction and Recommended Slots
```

## Optional Backup Slide: Current Project Structure

```text
.
|-- assets/images/                 # Syllabus/reference images
|-- css/                           # Application styles
|-- docs/                          # Report and security review
|-- js/                            # Browser app and AI modules
|-- js/ai/                         # Explainable AI model files
|-- scripts/                       # Local development servers
|-- .env.example                   # Secret template
|-- runtime-config.example.json    # Runtime config template
|-- Caddyfile                      # Optional local HTTPS config
`-- index.html                     # Static app entry point
```
