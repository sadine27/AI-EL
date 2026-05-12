# Literature Review: Smart Parking Availability Prediction using Explainable AI

## Document Scope

This literature review supports the project **Smart Parking Availability Prediction using Explainable AI**. It identifies the research papers that motivated the project idea, explains the major gaps found in those papers, and maps those gaps to the features implemented in the current project. The review is written to fit approximately four A4 pages when printed with normal academic formatting, such as 11 pt font, single line spacing, and standard margins.

The project is based on the following central research question:

> Can an AI agent estimate near-future parking availability around a selected area by observing live slot state, nearby places, road access, weather, time, and previous parking behavior, while also explaining the reason for its prediction?

Existing parking prediction research shows that machine learning can improve parking guidance systems, but many approaches are either sensor-heavy, dataset-dependent, zone-level, or difficult for ordinary users to interpret. This project adapts the ideas from those studies into a browser-based academic prototype that combines live parking data, historical logs, Google Maps Platform context signals, explainable machine learning components, route-aware recommendation, and responsible AI explanations.

## Background and Need for Literature Review

Parking availability prediction is an important smart-city problem because drivers often waste time, fuel, and road capacity while searching for an available parking slot. Traditional parking systems usually display only the current number of free spaces. That information is useful but incomplete because a slot visible at the time of search may become occupied before the driver arrives. A stronger system should estimate future availability, especially for short horizons such as 10, 15, or 30 minutes.

The reviewed literature confirms that this is a valid AI and machine learning problem. Parking occupancy depends on time of day, day of week, nearby demand generators, historical usage, traffic flow, sensor observations, weather, and spatial relationships between parking areas. However, a course-level engineering project cannot assume access to city-scale sensor networks or large private datasets. Therefore, the literature was used not only to choose prediction methods but also to identify a practical gap: how to build a transparent and demo-ready parking prediction system when only limited local data and public map context are available.

## Review of Key Research Papers

### 1. Awan et al. (2020): Comparative Analysis of ML and Deep Learning Models

Awan, Saleem, Minerva, and Crespi (2020) studied machine learning and deep learning models for parking space availability prediction. Their work compared multiple algorithms such as decision tree, random forest, K-nearest neighbors, multilayer perceptron, and ensemble methods. The paper established that parking availability can be treated as a supervised learning problem and that different models behave differently depending on the dataset and application context.

The main idea taken from this paper is that no single algorithm is universally best for parking prediction. Different models capture different types of behavior. For example, decision trees are interpretable, KNN can use similarity with previous cases, and neural models can combine many weighted inputs. This directly influenced the project design. Instead of depending on one black-box model, the project uses an explainable ensemble-style structure containing a decision tree risk classifier, a Bayesian pressure estimate, an instance-based learning component, and a neural-style weighted score.

The gap in the paper, from the perspective of this project, is that the study focuses mainly on model comparison and predictive performance. It does not emphasize a complete user-facing explanation layer for drivers. It also assumes availability of structured parking data, while a student prototype may have only local browser logs and optional external API signals. To fill this gap, our project adds responsible AI output: confidence percentage, source labels, model breakdown, fallback explanation, and a clear risk label. The driver sees not only a predicted number of free slots but also why the model gave that prediction.

### 2. Di Martino and Origlia (2020): Recurring Patterns and Scalability

Di Martino and Origlia (2020) proposed a method that uses recurring temporal patterns to improve the scalability of parking availability prediction systems. Their work is important because city-wide systems cannot always train a separate heavy model for every road segment or parking area. The paper shows that parking behavior often has strong recurring patterns, such as morning, evening, weekday, and weekend trends.

The project uses this idea by treating time and historical repetition as important features. The AI feature extractor considers hour of day, day of week, peak-hour conditions, weekend effects, and previous parking logs. The instance-based model compares the current situation with similar past situations, which is conceptually aligned with recurring-pattern reasoning.

The gap is that recurring-pattern systems can become less reliable when current local context changes suddenly. For example, a nearby restaurant opening, rain, unusual route difficulty, or a local event-like crowd can affect demand even if the historical pattern is moderate. This project fills the gap by combining historical pressure with live and contextual signals. Nearby place demand, opening status, review/rating strength, route/access pressure, and environmental pressure are included as optional signals. If historical logs are weak or unavailable, the model still produces a fallback prediction using live occupancy and public context.

### 3. Dia, Ahvar, and Lee (2022): AIoT-Based Segment Availability Prediction

Dia, Ahvar, and Lee (2022) evaluated machine learning and neural-network algorithms for predicting parking segment availability in an AIoT-based smart parking environment. The paper is relevant because it connects parking prediction with Internet of Things systems, where sensors can continuously collect real-time parking data. It highlights that short-term availability prediction can reduce search time and fuel consumption.

The idea taken from this paper is the value of treating parking as a continuously observed environment. In AI terms, the parking predictor behaves like an intelligent agent. It observes slot status, historical logs, user location, and context signals; then it acts by recommending a parking area or slot. The project implements this through local app state, simulated sensor updates, parking logs, reservation state, and AI prediction modules.

The gap is that AIoT parking systems usually assume sensor-rich infrastructure. That assumption is difficult for a browser-based academic prototype because real ultrasonic, camera, magnetic, or infrared sensors may not be available. The project fills the gap by creating a demo-ready substitute: slot states can be manually updated, reservations are logged, entry/exit actions create history, and simulated sensor updates can change slot availability. This allows the AI model to demonstrate sensor-driven reasoning without requiring physical IoT hardware.

Another gap is that segment-level predictions do not always give direct slot-level user guidance. A driver needs a practical answer: where should I park now? To address this, the project includes search-style slot recommendation. Candidate slots are ranked using availability, distance, occupancy pressure, route/access cost, and confidence.

### 4. Feng et al. (2022): Zone-Wise Hybrid Deep Learning

Feng, Xu, Hu, Krishnamoorthy, and Tang (2022) proposed a hybrid deep learning framework for zone-wise vacant parking space prediction. The paper uses spatial and temporal correlations across multiple parking lots and predicts short-term and longer-term vacant parking space availability. This research is important because parking demand in one area is not isolated; nearby parking lots and zones can influence each other.

The idea taken from this paper is that parking availability should consider spatial context, not only a single parking lot's current occupancy. Our project adapts this idea using map-based parking areas, geospatial coordinates, nearby place context, route distance, and nearby parking-area discovery. The system does not use the same ConvLSTM architecture because that would be excessive for the available data and project scope. Instead, it uses a lighter explainable model that still respects spatial context.

The gap is explainability and implementation complexity. Hybrid deep learning models can produce strong accuracy, especially with rich datasets, but they are harder to explain to an evaluator or driver. They also require substantial historical data, training infrastructure, and computational resources. Our project fills this gap by choosing an explainable model stack. The decision tree gives rule-style reasoning, the Bayesian model gives uncertainty-style pressure, the instance-based model uses similar historical examples, and the neural-style score demonstrates weighted non-linear scoring without becoming a deep black box.

### 5. Dahiya et al. (2024): ML Prediction in IoT-Enabled Smart Parking

Dahiya et al. (2024) studied machine learning-based prediction of parking space availability in IoT-enabled parking management systems. The paper compared models such as KNN, support vector machines, random forest, decision tree, logistic regression, and Naive Bayes using performance measures such as precision, recall, accuracy, and F1-score. The study found random forest to be strong for the evaluated scenario, while simpler methods had limitations in complex parking conditions.

This paper influenced the project's use of multiple machine learning paradigms from the AI syllabus. The project does not directly implement random forest because the prototype does not yet have enough real training data for a reliable forest model. Instead, it implements simpler models that are easier to explain and demonstrate: decision tree, Bayesian estimation, KNN-style instance learning, and a neural-style weighted score. This is suitable for the academic goal because the evaluator can inspect how each model contributes.

The gap is that IoT-enabled studies often assume real-time sensor networks and focus heavily on classification metrics. They may not address browser-side security, API key safety, missing data behavior, or user-facing explanation. The current project fills these practical engineering gaps by separating the AI module from the UI, excluding API keys from Git, using `.env.example` and runtime-config templates, documenting fallback behavior, and showing confidence/source labels when API signals are unavailable.

### 6. Cao et al. (2024): Survey of AI for Parking Forecasting

Cao, Choudhury, Winter, and Wang (2024) surveyed artificial intelligence methods for parking forecasting. Their survey is useful because it organizes the broader field: definitions of parking availability, datasets, machine learning modules, features, evaluation metrics, current limitations, and future research directions. The paper highlights that parking forecasting benefits from context-sensitive models and that traditional machine learning can struggle to capture complex dependencies.

The project takes two main ideas from this survey. First, parking prediction should use multiple feature groups instead of only current occupancy. Second, the system should be evaluated and improved over time using real prediction outcomes. This motivated the feature engineering layer in the project, which can combine live occupancy, historical pressure, nearby place demand, weather, route/access context, and time features.

The gap identified from the survey is that many advanced methods are research-oriented and dataset-oriented. They do not automatically translate into a small, understandable, working system that can be demonstrated in a college project. Our project fills this gap by implementing the full workflow: parking-area setup, slot creation, reservation, navigation, history logs, AI prediction, explanation, and documentation. The result is not just a theoretical model but a working prototype that maps directly to AI course concepts.

## Consolidated Research Gaps

Across the reviewed papers, the following common gaps were identified:

| Research Gap | Observed in Literature | Project Response |
| --- | --- | --- |
| Dependence on large historical datasets | Deep learning and many ML studies require rich training data | Uses local parking logs when available and fallback context signals when data is limited |
| Sensor-heavy assumptions | AIoT systems assume physical sensors and continuous infrastructure | Provides manual slot updates, reservation logs, entry/exit logs, and simulated sensor updates |
| Limited explainability | Accuracy-focused models may not show why a prediction was made | Adds model breakdown, risk label, confidence, source labels, and responsible AI explanation |
| Zone or segment focus | Some studies predict zone or segment availability but not direct slot choice | Adds slot-level recommendation using search-style scoring |
| Weak handling of missing APIs | Research datasets are usually clean and complete | Implements fallback behavior when Google/API context is unavailable |
| Limited deployment/security discussion | Academic model papers often do not handle browser-side API risk | Adds `.gitignore`, `.env.example`, runtime config template, and security review |
| Exact demand signals unavailable | Public APIs do not expose every demand signal such as Google popular-times data | Infers nearby demand from available public features like place count, type, opening state, distance, ratings, and review count |

## How the Project Fills the Gaps

The implemented project fills the literature gaps through a practical, explainable, and modular design.

First, the project uses an intelligent-agent model. The environment consists of parking areas, slots, nearby places, roads, weather, users, and historical logs. The sensors are local app state, browser location, simulated sensors, and optional Google Maps Platform signals. The actions are prediction, risk display, slot recommendation, reservation, and route guidance. This maps the research problem to the AI Foundations syllabus while keeping the system understandable.

Second, the project uses a hybrid explainable AI approach rather than a single black-box model. The decision tree model gives simple rule-based classification. The Bayesian model handles uncertain evidence. The instance-based model learns from similar previous cases. The neural-style score combines weighted input signals through a sigmoid-style function. The final prediction combines these outputs with live occupancy, nearby demand, history, environment, and route/access pressure.

Third, the project adds route-aware and user-facing recommendation. Many papers focus on predicting occupancy, but a driver also needs a decision. The project ranks slots and parking choices using a search-style cost function that considers availability, predicted occupancy pressure, route/access difficulty, and confidence. This connects parking prediction with AI search and optimization.

Fourth, the project uses map context responsibly. Since exact popular-times data is not available as a normal public API field, the system does not claim to use it directly. Instead, it infers demand from available public signals: nearby places, place types, opening status, ratings, review counts, distance, time, and weather. This keeps the project technically honest while still using real-world context.

Fifth, the project is designed for missing data. If Google API signals are unavailable, the AI still works with local occupancy, time, and history. The responsible AI module lowers confidence and explains which sources were available. This fills a practical gap in research prototypes, where missing API data or browser security constraints are often not discussed.

Finally, the project includes secure repository preparation. API keys are excluded from Git, local runtime configuration is templated, and the security review documents remaining risks. This is important because a browser project can accidentally expose API keys if uploaded carelessly.

## Final Literature-Based Design Justification

The literature shows that parking prediction is a strong AI/ML problem, but a useful academic prototype must balance accuracy, explainability, data availability, and implementation feasibility. The reviewed studies inspired the following design decisions:

- Use multiple model types instead of depending on one algorithm.
- Include historical and time-based recurring patterns.
- Simulate sensor behavior when physical IoT infrastructure is unavailable.
- Use geospatial and nearby-place context to represent local demand.
- Prefer explainable outputs over opaque high-complexity models.
- Add slot recommendation, not only occupancy prediction.
- Handle missing API signals and communicate confidence clearly.
- Prepare the project safely for GitHub publication.

Therefore, the current project fills the gap between research-level parking forecasting papers and a working, explainable, student-buildable smart parking application. It does not claim to outperform deep learning systems trained on large city datasets. Instead, it demonstrates how the core ideas from the literature can be converted into a practical, transparent, and secure AI prototype.

## References

Awan, F. M., Saleem, Y., Minerva, R., & Crespi, N. (2020). A comparative analysis of machine/deep learning models for parking space availability prediction. *Sensors, 20*(1), 322. https://doi.org/10.3390/s20010322

Cao, R., Choudhury, F., Winter, S., & Wang, D. Z. W. (2024). Artificial intelligence for parking forecasting: An extensive survey of machine learning techniques. *Transportmetrica A: Transport Science*. https://doi.org/10.1080/23249935.2024.2409229

Dahiya, A., Mittal, P., Sharma, Y. K., Lilhore, U., Simaiya, S., Ghith, E., & Tlija, M. (2024). Machine learning-based prediction of parking space availability in IoT-enabled smart parking management systems. *Journal of Advanced Transportation, 2024*, Article 8474973. https://doi.org/10.1155/2024/8474973

Dia, I., Ahvar, E., & Lee, G. M. (2022). Performance evaluation of machine learning and neural network-based algorithms for predicting segment availability in AIoT-based smart parking. *Network, 2*(2), 225-238. https://doi.org/10.3390/network2020015

Di Martino, S., & Origlia, A. (2020). Exploiting recurring patterns to improve scalability of parking availability prediction systems. *Electronics, 9*(5), 838. https://doi.org/10.3390/electronics9050838

Feng, Y., Xu, Y., Hu, Q., Krishnamoorthy, S., & Tang, Z. (2022). Predicting vacant parking space availability zone-wisely: A hybrid deep learning approach. *Complex and Intelligent Systems, 8*, 4145-4161. https://doi.org/10.1007/s40747-022-00700-1

Google Maps Platform Documentation. (2026). Places API, Routes API, Geocoding API, and related map services. https://developers.google.com/maps
