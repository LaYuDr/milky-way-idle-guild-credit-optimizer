(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildTrialAnalyticsView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Inherit the construction workspace: compact controls, readable figures,
  // continuous sections, and contained scrolling for wide data and charts.
  function createTrialAnalyticsView({
    api,
    t,
    escapeHtml: esc,
    trialName,
    recordDate,
    onSelectRecord,
    collapsedSections = [],
    onCollapsedChange = () => true
  }) {
    const collapsed = new Set(collapsedSections);
    let collapseSaveFailed = false;
    let records = [],
      selected = null,
      host = null,
      group = [],
      people = [];
    const state = {
      metric: "workDone",
      query: "",
      limit: "10",
      cohort: "all",
      measure: "total",
      start: "",
      member: "",
      y: "healingDone",
      memberPage: 0,
      recordPage: 0
    };
    const text = (key, values) => esc(t(key, values));
    const num = (value) =>
      typeof value === "number" && Number.isFinite(value)
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : "—";
    const pct = (value) =>
      value === null || value === undefined
        ? t("analysisNoRatio")
        : (value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
    const axisNum = (value) => value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
    const metricName = (field) => t(`trialField_${field}`);
    const week = (record) =>
      record.weekStartAt
        ? `${new Date(record.weekStartAt).getUTCMonth() + 1}/${new Date(record.weekStartAt).getUTCDate()}`
        : t("trialUnknownDate");
    const option = (value, label, current) =>
      `<option value="${esc(String(value))}"${String(value) === String(current) ? " selected" : ""}>${esc(label)}</option>`;
    const select = (role, label, options) =>
      `<label>${text(label)}<select data-analysis="${role}">${options}</select></label>`;
    const personName = (entry) => entry.name || t("trialFormerMember");
    const matchLabel = (entry) => t(`analysisMatch_${entry.match}`);
    const memberButton = (entry, body) =>
      `<button type="button" class="mwi-analysis-member" data-analysis-member="${esc(entry.identity)}" aria-label="${text("analysisOpenMember", { name: personName(entry) })}">${body || esc(personName(entry))}</button>`;
    const section = (id, title, content) =>
      `<section class="mwi-analysis-section" data-analysis-section="${id}" aria-labelledby="mwi-analysis-${id}"><h3 id="mwi-analysis-${id}"><button type="button" class="mwi-analysis-toggle" data-analysis-toggle="${id}" aria-expanded="${!collapsed.has(id)}" aria-controls="mwi-analysis-body-${id}"><span>${text(title)}</span><span class="mwi-analysis-toggle-action" data-analysis-toggle-label>${text(collapsed.has(id) ? "analysisExpand" : "analysisCollapse")}</span><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4"/></svg></button></h3><div id="mwi-analysis-body-${id}"${collapsed.has(id) ? " hidden" : ""}>${content}</div></section>`;
    const scrollTable = (caption, headers, rows) =>
      `<div class="mwi-analysis-table-scroll" role="region" tabindex="0" aria-label="${esc(caption)}"><table class="mwi-trial-table"><caption>${esc(caption)}</caption><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    const matches = (entry) => personName(entry).toLocaleLowerCase().includes(state.query.toLocaleLowerCase());

    function chart(points, label) {
      if (points.length < 2) return `<p class="mwi-trial-help">${text("analysisNeedTwo")}</p>`;
      const finite = points.filter((p) => p.value !== null);
      if (!finite.length) return `<p>${text("analysisMissing")}</p>`;
      const max = Math.max(...finite.map((p) => p.value), 1);
      if (points.length === 2)
        return `<div class="mwi-analysis-compare-bars" role="img" aria-label="${esc(label)}">${points.map((p) => `<div><span>${esc(p.label)}</span><div class="mwi-analysis-track"><i style="width:${p.value === null ? 0 : (p.value / max) * 100}%"></i></div><strong>${num(p.value)}</strong></div>`).join("")}</div>`;
      const minTime = points[0].time,
        span = points.at(-1).time - minTime || 1;
      const x = (p) => 64 + ((p.time - minTime) / span) * 672,
        y = (p) => 190 - (p.value / max) * 156;
      const paths = [];
      let path = "";
      for (const p of points) {
        if (p.value === null) {
          if (path) paths.push(path);
          path = "";
        } else path += `${path ? " L" : "M"}${x(p)} ${y(p)}`;
      }
      if (path) paths.push(path);
      const stride = Math.max(1, Math.ceil(points.length / 6));
      return `<div class="mwi-analysis-chart-scroll" role="region" tabindex="0" aria-label="${esc(label)}"><svg class="mwi-analysis-line" viewBox="0 0 800 240" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
        ${[0, 0.5, 1].map((f) => `<line x1="64" x2="736" y1="${190 - f * 156}" y2="${190 - f * 156}" class="mwi-analysis-gridline"/><text x="56" y="${194 - f * 156}" text-anchor="end">${axisNum(max * f)}</text>`).join("")}
        ${paths.map((d) => `<path d="${d}"/>`).join("")}
        ${finite.map((p) => `<circle cx="${x(p)}" cy="${y(p)}" r="4"><title>${esc(p.label)}: ${num(p.value)}</title></circle>`).join("")}
        ${points
          .filter((p, i) => i % stride === 0 || i === points.length - 1)
          .map((p) => `<text x="${x(p)}" y="220" text-anchor="middle">${esc(p.label)}</text>`)
          .join("")}</svg></div>`;
    }

    function overview() {
      const entries = api.entries(selected),
        stats = api.summary(entries, state.metric);
      const items = [
        [t("analysisRecordedMembers"), stats.count],
        [t("analysisTotalMetric", { metric: metricName(state.metric) }), stats.total],
        [t("analysisMean"), stats.mean],
        [t("analysisMedian"), stats.median]
      ];
      let markup = `<dl class="mwi-analysis-summary">${items.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${num(value)}</dd></div>`).join("")}</dl>`;
      if (selected.kind === "combat")
        markup += `<p class="mwi-trial-meta">${api
          .fields(selected)
          .map((field) => `${esc(metricName(field))}: <strong>${num(api.summary(entries, field).total)}</strong>`)
          .join(" · ")}</p>`;
      if (stats.known !== stats.count)
        markup += `<p class="mwi-trial-notice">${text("analysisKnown", { known: stats.known, count: stats.count })}</p>`;
      return section("overview", "analysisOverview", markup);
    }
    function ranks() {
      const ranked = api.ranking(api.entries(selected), state.metric),
        stats = api.summary(ranked, state.metric);
      const found = ranked.filter(matches),
        displayed = state.limit === "all" ? found : found.slice(0, 10);
      const max = Math.max(...ranked.map((r) => r.value ?? 0), 1);
      const controls = `<div class="mwi-analysis-controls">${select("limit", "analysisShow", option("10", t("analysisTop10"), state.limit) + option("all", t("analysisAll"), state.limit))}<p>${text("analysisTop5")}: <strong>${esc(pct(stats.top5Share))}</strong></p></div>`;
      return section(
        "ranking",
        "analysisRanking",
        controls +
          `<p class="mwi-trial-help">${text("analysisRankingHint")}</p><ol class="mwi-analysis-ranking" aria-label="${text("analysisRanking")}">${displayed.map((entry) => `<li><span class="mwi-analysis-rank">${entry.rank ?? "—"}</span>${memberButton(entry)}<div class="mwi-analysis-track" aria-hidden="true"><i style="width:${entry.value === null ? 0 : (entry.value / max) * 100}%"></i></div><strong>${num(entry.value)}</strong><span>${esc(pct(entry.share))}</span></li>`).join("")}</ol>${!displayed.length ? `<p>${text("analysisNoMembers")}</p>` : ""}`
      );
    }
    function compare() {
      const timeline = api.timeline(records, selected);
      if (!timeline.records.some((r) => String(r.weekStartAt) === state.start))
        state.start = String(timeline.records[0]?.weekStartAt || "");
      const result = api.comparison(records, selected, state.metric, state.cohort, Number(state.start));
      const points = result.points,
        statsKeys = ["count", "total", "mean", "median"];
      let markup = `<div class="mwi-analysis-controls">${select("start", "analysisFrom", timeline.records.map((r) => option(r.weekStartAt, recordDate(r), state.start)).join(""))}${select("cohort", "analysisCohort", option("all", t("analysisAllRecorded"), state.cohort) + option("shared", t("analysisShared"), state.cohort))}${select("measure", "analysisMeasure", statsKeys.map((key) => option(key, t(`analysisMeasure_${key}`), state.measure)).join(""))}</div>`;
      markup += `<p class="mwi-trial-help">${text("analysisCompareHint")}${state.cohort === "shared" ? " " + text("analysisSharedCount", { count: result.sharedCount }) : ""}</p>`;
      if (result.ambiguousWeeks)
        markup += `<p class="mwi-trial-notice">${text("analysisAmbiguousWeeks", { count: result.ambiguousWeeks })}</p>`;
      if (points.length < 2)
        return section("comparison", "analysisComparison", markup + `<p>${text("analysisNeedTwo")}</p>`);
      const diff = api.change(points[0].stats[state.measure], points.at(-1).stats[state.measure]);
      markup += `<p class="mwi-analysis-change">${text("analysisChange")}: <strong>${diff.absolute > 0 ? "+" : ""}${num(diff.absolute)}</strong> <span>(${diff.percent > 0 ? "+" : ""}${esc(pct(diff.percent))})</span></p>`;
      markup += chart(
        points.map((p) => ({ time: p.record.weekStartAt, label: week(p.record), value: p.stats[state.measure] })),
        t("analysisComparison")
      );
      markup += scrollTable(
        t("analysisComparisonData"),
        [t("analysisWeek"), ...statsKeys.map((key) => t(`analysisMeasure_${key}`))],
        points.map(
          ({ record, stats }) =>
            `<tr><th scope="row">${esc(recordDate(record))}</th>${statsKeys.map((key) => `<td>${num(stats[key])}</td>`).join("")}</tr>`
        )
      );
      return section("comparison", "analysisComparison", markup);
    }
    function member() {
      if (!people.some((p) => p.identity === state.member)) state.member = people[0]?.identity || "";
      const entry = people.find((p) => p.identity === state.member);
      const history = api.memberHistory(group, state.member, state.metric);
      let markup = `<div class="mwi-analysis-controls">${select("member", "trialMember", people.map((p) => option(p.identity, `${personName(p)} · ${matchLabel(p)}`, state.member)).join(""))}</div>`;
      if (!entry) return section("member", "analysisMember", markup + `<p>${text("analysisNoMembers")}</p>`);
      markup += `<p class="mwi-trial-help">${esc(matchLabel(entry))} · ${text("analysisMemberHint")}</p>`;
      const same = history.filter(
        (h) =>
          h.record.trialHrid === selected.trialHrid &&
          h.record.weekStartAt &&
          h.record.weekStartAt <= selected.weekStartAt
      );
      // Avoid connecting two alternative records for one week as a trend.
      const timeCounts = new Map();
      same.forEach((h) => timeCounts.set(h.record.weekStartAt, (timeCounts.get(h.record.weekStartAt) || 0) + 1));
      const unique = same.filter((h) => timeCounts.get(h.record.weekStartAt) === 1);
      markup += chart(
        unique.map((h) => ({ time: h.record.weekStartAt, label: week(h.record), value: h.entry.value })),
        t("analysisMemberTrend", { trial: trialName(selected), metric: metricName(state.metric) })
      );
      markup += `<p class="mwi-trial-meta">${text("analysisMemberTrend", { trial: trialName(selected), metric: metricName(state.metric) })}</p>`;
      const recordCounts = new Map();
      const groupKey = (h) => JSON.stringify([h.record.trialHrid, h.record.weekStartAt]);
      history.forEach((h) => recordCounts.set(groupKey(h), (recordCounts.get(groupKey(h)) || 0) + 1));
      const lastByProject = new Map();
      const rows = history.map((h) => {
        const previous = lastByProject.get(h.record.trialHrid);
        const delta =
          previous?.record.weekStartAt &&
          h.record.weekStartAt > previous.record.weekStartAt &&
          recordCounts.get(groupKey(previous)) === 1 &&
          recordCounts.get(groupKey(h)) === 1
            ? api.change(previous.entry.value, h.entry.value)
            : null;
        lastByProject.set(h.record.trialHrid, h);
        return `<tr><th scope="row">${esc(recordDate(h.record))}<small>${esc(trialName(h.record))}</small></th><td>${api
          .fields(h.record)
          .map((field) => `${esc(metricName(field))}: ${num(h.entry.values[field])}`)
          .join(
            "<br>"
          )}</td><td>${esc(metricName(h.field))}<br>${h.entry.rank ?? "—"} · ${esc(pct(h.entry.share))}</td><td>${delta ? `${delta.absolute > 0 ? "+" : ""}${num(delta.absolute)}<br>${delta.percent > 0 ? "+" : ""}${esc(pct(delta.percent))}` : "—"}</td></tr>`;
      });
      markup += scrollTable(
        t("analysisMemberData"),
        [t("analysisRecord"), t("analysisValues"), t("analysisRankShare"), t("analysisPrevious")],
        rows
      );
      return section("member", "analysisMember", markup);
    }
    function coverage() {
      const filtered = people.filter(matches),
        sorted = [...group].sort(
          (a, b) => (a.weekStartAt || 0) - (b.weekStartAt || 0) || a.trialHrid.localeCompare(b.trialHrid)
        );
      const memberPages = Math.max(1, Math.ceil(filtered.length / 20)),
        recordPages = Math.max(1, Math.ceil(sorted.length / 8));
      state.memberPage = Math.min(state.memberPage, memberPages - 1);
      state.recordPage = Math.min(state.recordPage, recordPages - 1);
      const shownMembers = filtered.slice(state.memberPage * 20, state.memberPage * 20 + 20),
        shownRecords = sorted.slice(state.recordPage * 8, state.recordPage * 8 + 8);
      let markup = `<p class="mwi-trial-help">${text("analysisCoverageHint")}</p><div class="mwi-analysis-legend">${["positive", "zero", "unknown", "absent"].map((s) => `<span class="mwi-analysis-cell ${s}">${text(`analysisCell_${s}`)}</span>`).join("")}</div>`;
      const pager = (role, page, pages, label) =>
        `<div class="mwi-analysis-pager"><span>${text(label)} ${page + 1}/${pages}</span><button type="button" data-analysis-page="${role}" data-step="-1"${page === 0 ? " disabled" : ""} aria-label="${text("analysisPrev")} ${text(label)}">${text("analysisPrev")}</button><button type="button" data-analysis-page="${role}" data-step="1"${page >= pages - 1 ? " disabled" : ""} aria-label="${text("analysisNext")} ${text(label)}">${text("analysisNext")}</button></div>`;
      markup += `<div class="mwi-analysis-controls">${pager("memberPage", state.memberPage, memberPages, "analysisMemberPages")}${pager("recordPage", state.recordPage, recordPages, "analysisRecordPages")}</div>`;
      markup += scrollTable(
        t("analysisCoverage"),
        [t("trialMember"), ...shownRecords.map((r) => `${week(r)} ${trialName(r)}`)],
        shownMembers.map(
          (entry) =>
            `<tr><th scope="row">${memberButton(entry)}</th>${shownRecords
              .map((record) => {
                const cell = api.coverage(record, entry.identity);
                const hint = cell.entry
                  ? api
                      .fields(record)
                      .map((field) => `${metricName(field)}: ${num(cell.entry.values[field])}`)
                      .join(" · ")
                  : t("analysisCell_absent");
                return `<td><span class="mwi-analysis-cell ${cell.state}" tabindex="0" title="${esc(recordDate(record) + " · " + hint)}" aria-label="${esc(personName(entry) + " · " + recordDate(record) + " · " + trialName(record) + " · " + hint)}">${text(`analysisCell_${cell.state}`)}</span></td>`;
              })
              .join("")}</tr>`
        )
      );
      if (!shownMembers.length) markup += `<p>${text("analysisNoMembers")}</p>`;
      return section("coverage", "analysisCoverage", markup);
    }
    function scatter() {
      if (selected.kind !== "combat")
        return section("scatter", "analysisScatter", `<p class="mwi-trial-help">${text("analysisCombatOnly")}</p>`);
      const entries = api
        .entries(selected)
        .filter(matches)
        .filter((e) => e.values.damageDealt !== null && e.values[state.y] !== null);
      const maxX = Math.max(...entries.map((e) => e.values.damageDealt), 1),
        maxY = Math.max(...entries.map((e) => e.values[state.y]), 1);
      let markup = `<div class="mwi-analysis-controls">${select("y", "analysisYAxis", ["healingDone", "premitigatedDamageTaken"].map((field) => option(field, metricName(field), state.y)).join(""))}</div><p class="mwi-trial-help">${text("analysisScatterHint")}</p>`;
      if (!entries.length) return section("scatter", "analysisScatter", markup + `<p>${text("analysisNoMembers")}</p>`);
      markup += `<div class="mwi-analysis-scatter"><span class="mwi-analysis-y-label">${esc(metricName(state.y))}</span><div class="mwi-analysis-plot" role="group" aria-label="${text("analysisScatter")}">${[0, 0.5, 1].map((f) => `<span class="mwi-analysis-y-tick" style="bottom:${f * 100}%">${axisNum(maxY * f)}</span><span class="mwi-analysis-x-tick" style="left:${f * 100}%">${axisNum(maxX * f)}</span>`).join("")}${entries
        .map((entry) => {
          const info = `${personName(entry)} · ${api
            .fields(selected)
            .map((field) => `${metricName(field)}: ${num(entry.values[field])}`)
            .join(" · ")}`;
          return `<button type="button" class="mwi-analysis-dot${entry.identity === state.member ? " selected" : ""}" style="left:${(entry.values.damageDealt / maxX) * 100}%;bottom:${(entry.values[state.y] / maxY) * 100}%" data-analysis-member="${esc(entry.identity)}" data-analysis-point="${esc(info)}" aria-label="${esc(info)}" title="${esc(info)}"></button>`;
        })
        .join(
          ""
        )}</div><span class="mwi-analysis-x-label">${esc(metricName("damageDealt"))}</span></div><p class="mwi-analysis-point-detail" data-analysis-detail aria-live="polite">${text("analysisPointHint")}</p>`;
      return section("scatter", "analysisScatter", markup);
    }
    function content() {
      group = api.scoped(records, selected);
      people = api.members(group);
      if (!api.fields(selected).includes(state.metric)) state.metric = api.fields(selected)[0];
      const scopes = [...new Map(records.map((r) => [api.scopeKey(r), r])).values()];
      const projects = [...new Map(group.map((r) => [r.trialHrid, r])).values()];
      const same = group.filter((r) => r.trialHrid === selected.trialHrid);
      const filters = `<div class="mwi-analysis-controls mwi-analysis-filters">${select("guild", "analysisScope", scopes.map((r) => option(api.scopeKey(r), r.guildName || (r.guildId ? String(r.guildId) : t("trialUnknownGuild")), api.scopeKey(selected))).join(""))}${select("project", "analysisProject", projects.map((r) => option(r.trialHrid, trialName(r), selected.trialHrid)).join(""))}${select("record", "analysisWeek", same.map((r) => option(r.key, recordDate(r), selected.key)).join(""))}${select(
        "metric",
        "analysisMetric",
        api
          .fields(selected)
          .map((field) => option(field, metricName(field), state.metric))
          .join("")
      )}<label>${text("analysisSearch")}<input type="search" data-analysis="query" value="${esc(state.query)}" placeholder="${text("analysisSearchPlaceholder")}"></label></div>`;
      const notes = `<details class="mwi-analysis-method"><summary>${text("analysisMethod")}</summary><p>${text("analysisMethodText")}</p>${selected.guildId === null ? `<p>${text("analysisUnknownGuild")}</p>` : ""}<p>${text("analysisIdentityHint")}</p></details>`;
      const nav = `<nav class="mwi-analysis-nav" aria-label="${text("analysisTitle")}">${[
        ["overview", "analysisOverview"],
        ["ranking", "analysisRanking"],
        ["comparison", "analysisComparison"],
        ["member", "analysisMember"],
        ["coverage", "analysisCoverage"],
        ["scatter", "analysisScatter"]
      ]
        .map(([id, key]) => `<button type="button" data-analysis-jump="${id}">${text(key)}</button>`)
        .join("")}</nav>`;
      return `<div class="mwi-analysis-context"><h2 class="mwi-analysis-heading">${text("analysisTitle")}</h2><p class="mwi-trial-meta">${esc(recordDate(selected))} · ${esc(trialName(selected))}</p></div>${filters}${notes}${nav}<p class="mwi-trial-notice" data-analysis-collapse-status role="status">${collapseSaveFailed ? text("analysisCollapseSaveFailed") : ""}</p><div class="mwi-analysis-sections">${overview()}${ranks()}${compare()}${member()}${coverage()}${scatter()}</div>`;
    }
    function setCollapsed(id, value) {
      const button = host?.querySelector(`[data-analysis-toggle="${id}"]`);
      if (!button || collapsed.has(id) === value) return;
      if (value) collapsed.add(id);
      else collapsed.delete(id);
      button.setAttribute("aria-expanded", String(!value));
      button.querySelector("[data-analysis-toggle-label]").textContent = t(
        value ? "analysisExpand" : "analysisCollapse"
      );
      host.querySelector(`#mwi-analysis-body-${id}`).hidden = value;
      collapseSaveFailed = onCollapsedChange([...collapsed]) === false;
      const status = host.querySelector("[data-analysis-collapse-status]");
      if (status) status.textContent = collapseSaveFailed ? t("analysisCollapseSaveFailed") : "";
    }
    function render(nextRecords, nextSelected) {
      records = nextRecords;
      selected = nextSelected;
      return `<div class="mwi-trial-analytics" data-role="trial-analytics">${content()}</div>`;
    }
    function focusAndReveal(target) {
      if (!target) return;
      const navigation = host.closest("#mwi-credit-optimizer")?.querySelector(".mwi-view-tabs-shell");
      target.style.scrollMarginTop = `${(navigation?.getBoundingClientRect().height || 48) + 16}px`;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    }
    function refresh(focusRole, identity) {
      const root = host?.querySelector('[data-role="trial-analytics"]');
      if (!root) return;
      root.innerHTML = content();
      if (identity) {
        const target = root.querySelector('[data-analysis="member"]');
        focusAndReveal(target);
      } else if (focusRole) root.querySelector(`[data-analysis="${focusRole}"]`)?.focus();
    }
    function bind(parent) {
      host = parent;
      let composing = false;
      host.addEventListener("change", (event) => {
        const role = event.target.dataset.analysis;
        if (!role) return;
        if (role === "query" && composing) return;
        const value = event.target.value;
        if (["guild", "project", "record"].includes(role)) {
          const record =
            role === "record"
              ? records.find((r) => r.key === value)
              : role === "guild"
                ? records.find((r) => api.scopeKey(r) === value)
                : group.find((r) => r.trialHrid === value && r.weekStartAt === selected.weekStartAt) ||
                  group.find((r) => r.trialHrid === value);
          if (record) {
            state.start = "";
            state.recordPage = 0;
            onSelectRecord(record.key);
            host.querySelector(`[data-analysis="${role}"]`)?.focus();
          }
          return;
        }
        if (Object.hasOwn(state, role)) {
          state[role] = value;
          if (role === "query") state.memberPage = 0;
          refresh(role);
        }
      });
      const applySearch = (event) => {
        if (event.target.dataset.analysis !== "query") return;
        if (composing || event.isComposing) return;
        state.query = event.target.value;
        state.memberPage = 0;
        const start = event.target.selectionStart;
        refresh("query");
        const input = host.querySelector('[data-analysis="query"]');
        if (start !== null) {
          try {
            input.setSelectionRange(start, start);
          } catch (_) {
            /* Search inputs may not support selection. */
          }
        }
      };
      host.addEventListener("input", applySearch);
      host.addEventListener("compositionstart", (event) => {
        if (event.target.dataset.analysis === "query") composing = true;
      });
      host.addEventListener("compositionend", (event) => {
        if (event.target.dataset.analysis !== "query") return;
        composing = false;
        applySearch(event);
      });
      host.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-analysis-toggle]");
        if (toggle) setCollapsed(toggle.dataset.analysisToggle, !collapsed.has(toggle.dataset.analysisToggle));
        const jump = event.target.closest("[data-analysis-jump]");
        if (jump) {
          setCollapsed(jump.dataset.analysisJump, false);
          focusAndReveal(host.querySelector(`[data-analysis-toggle="${jump.dataset.analysisJump}"]`));
        }
        const button = event.target.closest("[data-analysis-member]");
        if (button) {
          setCollapsed("member", false);
          state.member = button.dataset.analysisMember;
          refresh(null, true);
        }
        const pager = event.target.closest("[data-analysis-page]");
        if (pager) {
          state[pager.dataset.analysisPage] += Number(pager.dataset.step);
          refresh();
          host.querySelector(`[data-analysis-page="${pager.dataset.analysisPage}"]:not(:disabled)`)?.focus();
        }
      });
      const point = (event) => {
        const button = event.target.closest("[data-analysis-point]");
        const output = host.querySelector("[data-analysis-detail]");
        if (button && output) output.textContent = button.dataset.analysisPoint;
      };
      host.addEventListener("focusin", point);
      host.addEventListener("mouseover", point);
    }
    return { render, bind };
  }
  return { createTrialAnalyticsView };
});
