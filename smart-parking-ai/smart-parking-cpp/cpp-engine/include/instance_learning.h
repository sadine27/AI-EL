#ifndef INSTANCE_LEARNING_H
#define INSTANCE_LEARNING_H

#include "ai_utils.h"
#include <utility>

namespace parking {

struct InstanceResult {
    double score = 0.0;
    int neighbors = 0;
};

double similarity(const HistoricalRow& row, const FeatureVector& features);
InstanceResult instanceBasedPressure(const FeatureVector& features, int k = 5);

} // namespace parking

#endif // INSTANCE_LEARNING_H
