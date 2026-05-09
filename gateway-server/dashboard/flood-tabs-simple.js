
populateTrendsTab(type, data) {
    const tabHistory = document.getElementById('tabHistory');
    if (!tabHistory) return;

    let html = '<div style="padding:20px">';
    html += '<h3 style="color:var(--accent);margin-bottom:15px">Historical Trends</h3>';

    html += '<div style="background:var(--bg-card);padding:15px;border-radius:8px;margin-bottom:15px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:var(--text-primary)">2023 Flood Season</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8">';
    html += 'Peak Risk: 78% (Nov 15)<br>';
    html += 'Rainfall: 2,145mm (+42% above normal)<br>';
    html += 'Population Affected: 125,000<br>';
    html += 'Damage: ₹850 Crore<br>';
    html += 'Critical Period: Oct 28 - Dec 10';
    html += '</div></div>';

    html += '<div style="background:var(--bg-card);padding:15px;border-radius:8px;margin-bottom:15px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:var(--text-primary)">Impact Analysis</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8">';
    html += '15 villages evacuated (12,500 people)<br>';
    html += '3,200 houses damaged<br>';
    html += 'Agricultural loss: 8,500 hectares<br>';
    html += 'Road network: 450km disrupted<br>';
    html += 'Power outage: 72 hours average';
    html += '</div></div>';

    html += '<div style="background:var(--bg-elevated);padding:15px;border-radius:8px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:var(--text-primary)">Year-over-Year</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8">';
    html += '2023 vs 2022: +35% rainfall, +42% flood events<br>';
    html += '2022 vs 2021: -18% rainfall, -25% flood events<br>';
    html += '5-year average: 1,850mm rainfall<br>';
    html += 'Trend: Increasing frequency & intensity';
    html += '</div></div>';

    html += '</div>';
    tabHistory.innerHTML = html;
}

populateActionsTab(type, data) {
    const tabActions = document.getElementById('tabActions');
    if (!tabActions) return;

    let html = '<div style="padding:20px">';
    html += '<h3 style="color:var(--accent);margin-bottom:15px">Historical Actions</h3>';

    html += '<div style="background:var(--bg-card);padding:15px;border-radius:8px;margin-bottom:15px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:#10b981">✓ Nov 2023 Success</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:10px">';
    html += '<strong>Action:</strong> Preemptive evacuation of 12,500 residents<br>';
    html += '<strong>Trigger:</strong> 48-hour forecast: 285mm rainfall<br>';
    html += '<strong>Timeline:</strong> Completed 18 hours before peak<br>';
    html += '<strong>Resources:</strong> 45 buses, 12 boats, 8 camps';
    html += '</div>';
    html += '<div style="padding:10px;background:rgba(16,185,129,0.1);border-radius:6px;border-left:3px solid #10b981">';
    html += '<strong>Outcome:</strong> Zero casualties, 95% property damage prevented';
    html += '</div></div>';

    html += '<div style="background:var(--bg-card);padding:15px;border-radius:8px;margin-bottom:15px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:#eab308">⚠ Oct 2023 Partial Success</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:10px">';
    html += '<strong>Action:</strong> Emergency dam release (50,000 cusecs)<br>';
    html += '<strong>Challenge:</strong> Delayed warning downstream<br>';
    html += '<strong>Response Time:</strong> 6 hours before release';
    html += '</div>';
    html += '<div style="padding:10px;background:rgba(234,179,8,0.1);border-radius:6px;border-left:3px solid #eab308">';
    html += '<strong>Outcome:</strong> 320 houses affected<br>';
    html += '<strong>Lesson:</strong> Need 24-hour advance warning';
    html += '</div></div>';

    html += '<div style="background:var(--bg-card);padding:15px;border-radius:8px;margin-bottom:15px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:#10b981">✓ Dec 2023 Infrastructure</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:10px">';
    html += '<strong>Action:</strong> Mobile pumping stations deployed<br>';
    html += '<strong>Scale:</strong> 15 high-capacity pumps (500HP each)<br>';
    html += '<strong>Duration:</strong> 96 hours continuous<br>';
    html += '<strong>Area:</strong> 85 sq km urban flooding';
    html += '</div>';
    html += '<div style="padding:10px;background:rgba(16,185,129,0.1);border-radius:6px;border-left:3px solid #10b981">';
    html += '<strong>Outcome:</strong> 2.5 feet reduction in 48 hours, ₹450 Cr loss prevented';
    html += '</div></div>';

    html += '<div style="background:var(--bg-elevated);padding:15px;border-radius:8px">';
    html += '<div style="font-weight:600;margin-bottom:10px;color:var(--text-primary)">Resource Deployment</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8">';
    html += 'NDRF Teams: 12 deployments (avg 2.5 hour response)<br>';
    html += 'Relief Materials: 25,000kg distributed<br>';
    html += 'Medical Teams: 18 mobile units, 3,200 patients<br>';
    html += 'Rescue Operations: 850 evacuated, 2,100 rescued<br>';
    html += 'Financial Aid: ₹125 Crore disbursed';
    html += '</div></div>';

    html += '</div>';
    tabActions.innerHTML = html;
}
