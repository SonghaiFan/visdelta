"""Reproduce the archived-weather facts used by the unified Story demo."""
import collections, datetime as dt, hashlib, json, math
from pathlib import Path

root = Path(__file__).resolve().parent
source = root / 'archive.json'
raw = json.loads(source.read_text())
rows = [dict(zip(raw['columns'], row)) for row in raw['rows']]
keys = [(r['date'], r['metric']) for r in rows]
profile = {'source': str(source.relative_to(root)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
           'rows': len(rows), 'duplicate_date_metric': len(keys)-len(set(keys)), 'metrics': {}}
for metric in ['tmax', 'tmin']:
    part = [r for r in rows if r['metric'] == metric]
    dates = {dt.date.fromisoformat(r['date']) for r in part}
    start, end = min(dates), max(dates)
    missing = [(start+dt.timedelta(days=i)).isoformat() for i in range((end-start).days+1) if start+dt.timedelta(days=i) not in dates]
    years = collections.Counter(r['date'][:4] for r in part)
    profile['metrics'][metric] = {'rows': len(part), 'first': str(start), 'last': str(end), 'missing_dates': missing,
      'source_counts': dict(collections.Counter(r['source'] for r in part)),
      'min': min(part,key=lambda r:r['temperature']), 'max': max(part,key=lambda r:r['temperature']),
      'year_counts': dict(years), 'invalid_numeric': sum(not all(isinstance(r[k],(int,float)) and math.isfinite(r[k]) for k in ['temperature','percentile','day_of_year']) for r in part),
      'percentile_range': [min(r['percentile'] for r in part),max(r['percentile'] for r in part)]}
# A common calendar aligns month/day without shifting all dates after February in leap years.
def season_day(date):
    d = dt.date.fromisoformat(date)
    if (d.month,d.day)==(2,29): return None
    return (dt.date(2001,d.month,d.day)-dt.date(2001,1,1)).days
anchor = '2009-02-07'
anchor_temperature = next(r['temperature'] for r in rows if r['date']==anchor and r['metric']=='tmax')
center = season_day(anchor)
window = [r for r in rows if r['metric']=='tmax' and season_day(r['date']) is not None and min(abs(season_day(r['date'])-center),365-abs(season_day(r['date'])-center))<=7]
selected = [r for r in window if r['percentile']>=95]
profile['anchor'] = {'date':anchor,'observation':next(r for r in rows if r['date']==anchor and r['metric']=='tmax'),
 'next_day': next(r for r in rows if r['date']=='2009-02-08' and r['metric']=='tmax'),
 'year_days_at_least_40':[{ 'date': r['date'], 'temperature': r['temperature']} for r in rows if r['date'].startswith('2009') and r['metric']=='tmax' and r['temperature']>=40],
 'year_count': sum(r['date'].startswith('2009') and r['metric']=='tmax' for r in rows),
 'window_count':len(window),'window_years':len({r['date'][:4] for r in window}),
 'threshold95_count':len(selected),'threshold100_count':sum(r['percentile']>=100 for r in window),
 'window_days_at_least_anchor':sum(r['temperature']>=anchor_temperature for r in window),
 'threshold95_share':len(selected)/len(window),
 'threshold100_temperature_range':[min(r['temperature'] for r in window if r['percentile']>=100),max(r['temperature'] for r in window if r['percentile']>=100)],
 'archive_max_ties':sum(r['metric']=='tmax' and r['temperature']==anchor_temperature for r in rows),
 'window_min':min(r['temperature'] for r in window),'window_max':max(r['temperature'] for r in window),
 'selected_bins': dict(sorted(collections.Counter(math.floor(r['temperature']*2)/2 for r in selected).items())),
 'all_bins':dict(sorted(collections.Counter(math.floor(r['temperature']*2)/2 for r in window).items()))}
lookup = {(r['date'],r['metric']):r['temperature'] for r in rows}
profile['paired_min_above_max'] = sum(lookup[(date,'tmin')]>value for (date,metric),value in lookup.items() if metric=='tmax' and (date,'tmin') in lookup)
out = root/'weather-analysis.json'
out.write_text(json.dumps(profile,indent=2)+'\n')
print(json.dumps({'rows':profile['rows'],'duplicates':profile['duplicate_date_metric'], 'metrics':{k:{f:v[f] for f in ['rows','first','last','missing_dates','source_counts','min','max']} for k,v in profile['metrics'].items()},'anchor':profile['anchor'],'min_above_max':profile['paired_min_above_max']},indent=2))
