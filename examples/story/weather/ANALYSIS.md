# One weather archive, one story

The unified demo asks: **What makes a day exceptional?** It opens with a result
found in the supplied file, then distinguishes three different descriptions of
rarity: a recorded temperature, the archive's supplied integer rank, and the
observed count in a comparable seasonal window. It does not claim a return
period, a causal explanation, or a climate trend.

## Evidence

Reproduce with `python3 examples/story/weather/analyze.py`. The exact source
hash, profile, year counts and independently computed half-degree bins are in
[weather-analysis.json](weather-analysis.json). The controlling source is
`examples/story/weather/archive.json`, copied from the earlier case-study archive. No
external station series has been substituted.

| Check | Result | Consequence |
| --- | --- | --- |
| Grain / duplicates | 82,033 date-and-measure records; 0 duplicate keys | Each selected point/unit is one recorded daily measure |
| Daily maxima | 41,016, 1910-01-01–2022-04-19 | The final year is partial |
| Daily minima | 41,017, 1910-01-01–2022-04-20 | Measure-specific coverage differs by one day |
| Missing dates | 2021-07-08 in both measures | Missing observations remain missing, never zero |
| Paired minimum > maximum | 0 | No contradiction in paired daily values was found |
| Source labels | 80,354 acorn; 1,679 raw | Provenance/preparation cannot be independently recovered from these labels |
| Maximum daily maximum | Unique 45.9°C, 2009-02-07, acorn-labelled | An archive-specific opening fact; not an independently verified station-record claim |
| Default seasonal window | 31 January–14 February; 1,695 observations / 113 years | A same-season reference rather than a summer/winter comparison |
| Supplied rank ≥95 | 118 / 1,695 = 6.96%, displayed 7.0% | Not exactly the top 5% of this window |
| Supplied rank ≥100 | 21 observations, 39.5–45.9°C | An integer rank label does not isolate the single maximum |
| Observations ≥45.9°C in the window | 1 | An observed sample count, not a forecast probability or return period |

The supplied percentile reference population and rounding procedure are unknown.
This is a material limit for rank interpretation. The mixed source labels and
incomplete final year also prevent an unqualified climate-trend reading.

The 2009 line gives the opening a time sequence: five archived daily maxima at
or above 40°C (20, 28, 29, 30 January and 7 February). The 28–30 January values
are 43.2, 44.1 and 44.9°C. The maximum on 8 February is 20.9°C, 25°C lower than
the previous day's maximum. This describes consecutive daily maxima, not an
instantaneous temperature drop. The chosen seasonal window starts on 31 January
and therefore excludes the earlier three-day run; that selection limit is visible
in the story instead of treating a ±7-day window as the whole episode.

## Narrative and charts

1. **One year:** a native line chart places the starting date in the complete
   2009 record (365 daily maxima). Other selections show their actual available
   records, including partial years.
2. **Same season:** points show the ±7-day common-calendar window across available
   years. The observed count at or above the selected temperature is explicit.
3. **Choose the tail:** the percentile control filters native point data. Prose reads the native filtered rows and
   reports both the selected count and its actual seasonal-window denominator.
4. **Keep their dates:** the same selected identities move to year stacks. The
   chart locates records in time without asserting a trend. Slots are inherited
   from the full window, so subset gaps are explained.
5. **Read their temperatures:** the same identities move to temperature stacks.
   The actual selected temperature range is stated in the prose.
6. **One dot per day:** selected source records become native unit marks in
   0.5°C bins. One mark still represents one observation.
7. **The distribution:** native bar rollup counts those same selected records.
   The sum of bin counts must equal the point and unit population. Empty bins
   retain a slot in the native bar domain, so gaps preserve the half-degree
   spacing without adding artificial zero-valued observations.

The single story preserves the strongest parts of both earlier demos. Station
locations are omitted because the archive contains observations for Melbourne
only. A single-year 1910 comparison is omitted because it is a weak basis for
judging rarity. Restoring all days and comparing an annual histogram to a seasonal
subset are omitted to avoid changing the denominator during the final argument.
Old weather adapter exports remain compatible with saved MDX documents, but the
Studio toolbar and both example URLs resolve to one authored story.

## Calendar and selection rules

Seasonal comparison maps month/day to a common non-leap reference year (2001),
using the smaller circular distance on 365 days, inclusive ±7 days. February 29
observations are excluded from seasonal windows. A February 29 selection uses
February 28 as its seasonal centre, while its actual selected observation and
annual line are retained. This avoids shifting all dates after February in leap
years. Windows wrap around New Year and use available records only; coverage
near archive boundaries is not silently completed.

The annual line uses actual day-of-year and retains leap days. Every data-derived
sentence follows the selected date/measure/threshold. Static 2009 facts explicitly
say they describe the starting settings. High-ranked daily minima mean warm
nights. The story does not substitute other stations' observations or fill gaps.

## Verification

Archive predicates independently establish the opening maximum, seasonal sample,
rank counts and per-bin totals. Browser checks cover all seven views in both
directions, hashes, actual selected marks, control/prose/style edits, archive retry,
missing observations, minimum-temperature wording, narrow layouts and slider
latency. Native filtered row IDs, unit row IDs and histogram sums are reconciled.
