const d = JSON.parse(require('fs').readFileSync('dashboard/inventory-data.json', 'utf8'));
console.log('=== DATASET STATS ===');
console.log('SKUs:', d.skus.length);
console.log('Weeks/SKU:', d.skus[0].weeklyHistory.length);
console.log('Total data points:', d.skus.length * d.skus[0].weeklyHistory.length);
console.log('Categories:', d.categories.length);
console.log('Holidays:', d.holidays.length);
console.log('Locations:', d.metadata.locations.length);
console.log();

console.log('=== RISK DISTRIBUTION ===');
const riskBuckets = { CRITICAL: 0, HIGH: 0, ELEVATED: 0, MODERATE: 0, HEALTHY: 0 };
d.skus.forEach(sk => {
    const avgD = sk.weeklyHistory.reduce((s, v) => s + v, 0) / sk.weeklyHistory.length;
    const ratio = sk.currentStock / avgD;
    if (ratio < 1) riskBuckets.CRITICAL++;
    else if (ratio < 2) riskBuckets.HIGH++;
    else if (ratio < 3) riskBuckets.ELEVATED++;
    else if (ratio < 5) riskBuckets.MODERATE++;
    else riskBuckets.HEALTHY++;
});
Object.entries(riskBuckets).forEach(([k, v]) => console.log(`  ${k}: ${v} SKUs`));
console.log();

console.log('=== SAMPLE SKUS (first 10) ===');
d.skus.slice(0, 10).forEach(s => {
    const avgD = Math.round(s.weeklyHistory.reduce((a, b) => a + b, 0) / s.weeklyHistory.length);
    console.log(`  ${s.id} ${s.name.padEnd(25)} stock:${String(s.currentStock).padEnd(5)} avg:${String(avgD).padEnd(5)} ratio:${(s.currentStock / avgD).toFixed(1).padEnd(5)} promos:${s.promotions.length} returns:${s.returns.length} supplier:${s.supplier || 'N/A'}`);
});
console.log();

console.log('=== FILE SIZE ===');
const stat = require('fs').statSync('dashboard/inventory-data.json');
console.log('  Size:', (stat.size / 1024).toFixed(0) + ' KB');
