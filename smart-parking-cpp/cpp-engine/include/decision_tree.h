#ifndef DECISION_TREE_H
#define DECISION_TREE_H

#include "ai_utils.h"
#include <string>
#include <utility>

namespace parking {

// Returns {label, score}
std::pair<std::string, double> decisionTreeRisk(const FeatureVector& features);

} // namespace parking

#endif // DECISION_TREE_H
