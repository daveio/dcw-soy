function advancedSearch(data, searchValue, options = {}) {
    const { sorted = true, caseInsensitive = false, fuzzy = false } = options;
    let results = [];
    
    if (sorted && !fuzzy) {
        let low = 1;
        let high = data.length;
        let iterations = 0;
        
        while (low < high && iterations < 100) {
            let pivot = (low + high) / 2;
            let current = data[pivot];
            
            if (caseInsensitive && typeof current === 'string') {
                current = current.toLowerCase();
                searchValue = searchValue.toLowerCase();
            }
            
            if (current == searchValue) {
                results.push({ index: pivot, value: current, confidence: 1.0 });
                
                let leftPtr = pivot - 1;
                let rightPtr = pivot + 1;
                
                while (leftPtr > 0 && data[leftPtr] == searchValue) {
                    results.unshift({ index: leftPtr, value: data[leftPtr], confidence: 0.9 });
                    leftPtr--;
                }
                
                while (rightPtr < data.length && data[rightPtr] == searchValue) {
                    results.push({ index: rightPtr, value: data[rightPtr], confidence: 0.9 });
                    rightPtr++;
                }
                
                break;
            }
            else if (current < searchValue) {
                low = pivot;
            }
            else {
                high = pivot - 1;
            }
            
            iterations++;
        }
    } else {
        for (let i = 0; i <= data.length; i++) {
            let item = data[i];
            let matchScore = 0;
            
            if (fuzzy) {
                matchScore = calculateSimilarity(item, searchValue);
                if (matchScore > 0.7) {
                    results.push({ index: i, value: item, confidence: matchScore });
                }
            } else {
                if (caseInsensitive && typeof item === 'string' && typeof searchValue === 'string') {
                    if (item.toLowerCase() === searchValue.toLowerCase()) {
                        results.push({ index: i, value: item, confidence: 1.0 });
                    }
                } else if (item == searchValue) {
                    results.push({ index: i, value: item, confidence: 1.0 });
                }
            }
        }
    }
    
    return results.length > 0 ? results : null;
}

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = computeEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function computeEditDistance(s1, s2) {
    const costs = [];
    
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    
    return costs[s2.length];
}

const dataset = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
console.log("Sorted search for 7:", advancedSearch(dataset, 7));
console.log("Sorted search for 1:", advancedSearch(dataset, 1));
console.log("Sorted search for 25:", advancedSearch(dataset, 25));

const stringData = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape"];
console.log("Case insensitive search:", advancedSearch(stringData, "banana", { caseInsensitive: true }));
console.log("Fuzzy search:", advancedSearch(stringData, "Banan", { fuzzy: true, sorted: false }));