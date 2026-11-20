"use strict";
(async () => {
  const publik = window.SparrowPublik;
  if (!location.hash || ["#/", "#features", "#ai"].includes(location.hash)) {
    await new Promise((resolve) => {
      document.querySelectorAll("[data-enter-app]").forEach((link) =>
        link.addEventListener("click", resolve, { once: true }),
      );

    });
  }
  document.getElementById("public-site").hidden = true;
  document.getElementById("main").hidden = false;
  const signedIn = await publik.ensureSignedIn();
  if (location.hash === "#/login") location.hash = "/";
  document.getElementById("header").hidden = false;
  document.getElementById("footer").hidden = false;
  const D = SPARROW_DATA,
    KEY = "sparrow.preview.v2:" + signedIn.principal;
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const clean = () => ({
    version: 1,
    profile: {},
    step: 0,
    onboarded: false,
    tourDone: false,
    saved: {},
    colleges: {},
    submissions: [],
    advisor: {
      task: "Build a realistic plan",
      draft: "",
      opportunityIds: [],
      collegeIds: [],
      answer: null,
      providerRequestId: null,
    },
  });
  let state = clean(),
    storageOK = true,
    filters = {
      q: "",
      type: "",
      interest: "",
      mode: "",
      grade: "",
      free: false,
      location: "",
    },
    collegeFilters = { q: "", saved: false },
    savedTab = "All saved",
    editSubmission = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.version === 1) {
      state = { ...clean(), ...raw };
      if (
        !state.profile ||
        typeof state.profile !== "object" ||
        !Array.isArray(state.submissions) ||
        !state.saved ||
        !state.colleges
      )
        state = clean();
    }
  } catch {
    storageOK = false;
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      storageOK = false;
      toast(
        "Browser storage is unavailable. Changes will last for this visit only.",
      );
      return false;
    }
  }
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3400);
  }
  const arrow = '<span class="arrow" aria-hidden="true">â†—</span>';
  const bird =
    '<svg aria-hidden="true" viewBox="0 0 40 40"><path fill="currentColor" d="M3 12 19 18 36 5 27 24 13 34 16 22Z"/></svg>';
  function icon(name) {
    const paths = {
      bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
      science:
        '<path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"/><circle cx="12" cy="13" r="1"/>',
      code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
      design: '<path d="m4 17 12-12 4 4L8 21H4zM13 8l4 4M4 3h6M4 7V3"/>',
      leaf: '<path d="M20 3C9 2 3 7 4 14s13 10 16-11ZM5 19 16 8M10 15v-5m0 5h5"/>',
      policy: '<path d="M3 9 12 3l9 6M5 10v9m7-9v9m7-9v9M2 21h20"/>',
      gear: '<path d="m7 4 5-2 5 2v4l4 2v5l-4 2v4H7v-4l-4-2v-5l4-2z"/><circle cx="12" cy="12" r="4"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.spark}</svg>`;
  }
  const symbol = (o) =>
    `<span class="symbol ${o.color}">${icon(o.icon)}</span>`;
  const btn = (text, href, style = "") =>
    `<a class="btn ${style}" href="${href}">${text}</a>`;
  const notice = (text, neutral = false) =>
    `<div class="notice ${neutral ? "neutral" : ""}">${text}</div>`;
  const opts = (values, current, empty) =>
    `${empty !== undefined ? `<option value="">${empty}</option>` : ""}${values.map((v) => `<option value="${esc(v)}" ${String(current) === String(v) ? "selected" : ""}>${esc(v)}</option>`).join("")}`;
  const field = (label, name, value = "", type = "text", extra = "") =>
    `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select = (label, name, values, value = "", empty) =>
    `<label class="field">${label}<select name="${name}">${opts(values, value, empty)}</select></label>`;
  const textarea = (label, name, value = "", extra = "") =>
    `<label class="field">${label}<textarea name="${name}" maxlength="4000" ${extra}>${esc(value)}</textarea></label>`;
  const pageHead = (kicker, title, desc, action = "") =>
    `<div class="page-head"><div><p class="kicker">${kicker}</p><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
  const page = (html) => `<div class="page wrap route-ready">${html}</div>`;
  function route() {
    return (location.hash.slice(1) || "/").split("?")[0];
  }
  function nav() {
    const r = route(),
      home = r === "/";
    $("#header").innerHTML =
      `<div class="wrap header-inner"><a class="brand" href="#/" aria-label="Sparrow home">${bird}sparrow</a><nav class="nav" aria-label="Main navigation">${[["Opportunities", "/opportunities"], ["Colleges", "/colleges"], [home ? "How it works" : "My opportunities", home ? "/how-it-works" : "/saved"], ...(!home ? [["Advisor", "/advisor"]] : [])].map(([n, p]) => `<a href="#${p}" ${r === p ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav><div class="header-actions"><a class="text-link" href="#${home ? "/saved" : "/credits"}">${home ? "My opportunities" : "Credits"}</a>${btn(home ? "Start your path" : state.onboarded ? "Your profile" : "Start your path", state.onboarded ? "#/settings" : "#/start", "small")}<button class="menu-toggle" aria-label="Open navigation" aria-expanded="false">â˜°</button></div></div>`;
    $("#footer").innerHTML =
      `<div class="wrap"><div class="footer-row"><a class="brand" href="#/">${bird}sparrow</a><div class="footer-links"><a href="#/opportunities">Opportunities</a><a href="#/contribute">Add an opportunity</a><a href="#/settings">Profile & local data</a><a href="#/credits">Credits</a></div></div><div class="footer-bottom"><p>Interactive foundation Â· Your data stays in this browser.</p><a class="text-link" href="#top" data-top>Back to top â†‘</a></div></div>`;
  }
  function mini(o) {
    return `<div class="mini-card"><div class="mini-head">${symbol(o)}<div><h4>${o.title}</h4><p>${o.type} Â· ${o.interest}</p></div></div><div class="mini-bottom"><span class="tag">${o.mode}</span><span>Grades ${o.grades[0]}â€“12</span><span>Â· ${o.cost}</span>${icon("bookmark")}</div></div>`;
  }
  function landing() {
    return `<section class="hero" data-enter><div class="wrap hero-grid"><div><div class="eyebrow">A next step, on your terms</div><h1>A little direction.<br>A world of<br><em>possibility.</em></h1><p class="lead">Find extracurriculars and awards, explore colleges, and keep your applications moving. Make room for what interests you.</p><div class="actions">${btn('Start your path <span aria-hidden="true">â†’</span>', "#/start")}<a class="text-link" href="#/opportunities">Browse opportunities ${arrow}</a></div><p class="hero-note">${icon("check")} Free organization. Built for grades 9â€“12.</p></div><div class="hero-art" data-enter-media><div class="orbit"></div><span class="hero-stamp">Illustrative preview</span><div class="app-frame"><div class="frame-top"><strong>Your next chapter</strong><span class="frame-label">Example collection</span></div><div class="frame-heading"><h3>Room to explore.</h3><span>Made for your interests</span></div>${mini(D.opportunities[0])}${mini(D.opportunities[1])}${mini(D.opportunities[2])}<div class="saved-cue"><span class="check-disc">âœ“</span><div><strong>One possibility. One next step.</strong><p>Example task: draft a statement of interest</p></div></div></div></div></div></section>
<section class="section white" id="how-it-works"><div class="wrap"><div class="section-heading"><div><p class="kicker">From curious to getting started</p><h2>A path that starts with you.</h2></div><p>You don't need a chosen career or a finished plan. Start with an interest, and take it from there.</p></div><div class="steps"><article class="step"><div class="step-number">01 / YOUR STARTING POINT</div><h3>Tell us about you.</h3><p>Your interests, time, and budget help you narrow down what to explore.</p><div class="step-visual"><span class="small muted">I'm interested inâ€¦</span><div class="chips"><span class="chip active">Neuroscience âœ“</span><span class="chip">Arts</span><span class="chip">Computing</span><span class="chip">Still exploring</span></div></div></article><article class="step"><div class="step-number">02 / YOUR POSSIBILITIES</div><h3>Find something that fits.</h3><p>Look through programs, volunteering, competitions, and awards in one place.</p><div class="step-visual"><div class="mini-head">${symbol(D.opportunities[0])}<div><strong class="small">Community Science Lab</strong><p class="small muted">Fictional example</p></div></div><div class="chips"><span class="tag">Virtual</span><span class="tag">Free</span></div></div></article><article class="step"><div class="step-number">03 / YOUR NEXT MOVE</div><h3>Turn interest into action.</h3><p>Save a possibility, set your next task, and keep your application moving.</p><div class="step-visual"><div class="line-item"><span class="check-disc">âœ“</span> Save an opportunity</div><div class="line-item"><span aria-hidden="true">â˜</span> Draft a statement of interest</div><div class="line-item"><span aria-hidden="true">â˜</span> Review the requirements</div></div></article></div></div></section>
<section class="section" data-moment="word-highlight"><div class="wrap credit-split"><div class="credit-copy"><p class="kicker">A little clarity on credits</p><h2 class="mo-wh__text">Your plans have room to grow. Your <strong>organization stays free.</strong></h2><p>Save opportunities, keep college lists, and track applications. Personalized AI requests use your selected publik provider after confirmation.</p><a class="text-link" href="#/credits">See how credits work ${arrow}</a></div><div class="credit-panel"><div class="credit-row"><h3>The everyday essentials <span class="free-label">Free</span></h3><p>Browse, save, shortlist, and track your next steps.</p></div><div class="credit-row"><h3>Guidance when you need it</h3><p>AI can help with general planning, project milestones, and draft feedback. AI requests use your selected publik provider after confirmation.</p></div><div class="credit-row"><h3>Your work, your pace</h3><p>No streaks to maintain. Come back when you're ready to take the next step.</p></div></div></div></section>`;
  }
  function tour() {
    return page(`<section class="tour-page"><p class="kicker">Welcome to Sparrow</p><h1>See what you can do here.</h1><p>Take a quick look around, then start exploring at your own pace.</p><div class="tour-grid"><article><span>Explore</span><h2>Find possibilities</h2><p>Browse illustrative opportunities and explore colleges.</p></article><article><span>Organize</span><h2>Keep moving</h2><p>Save ideas, track applications, and set your next task.</p></article><article><span>Advisor</span><h2>Ask for help</h2><p>Send a planning question or draft when you want AI feedback.</p></article></div><div class="actions"><a class="btn" href="#/start" data-finish-tour>Build my profile</a><a class="btn secondary" href="#/opportunities" data-finish-tour>Explore opportunities</a></div></section>`);
  }
  function saveButton(o) {
    return `<button class="icon-button ${state.saved[o.id] ? "saved" : ""}" data-save="${o.id}" aria-label="${state.saved[o.id] ? "Unsave" : "Save"} ${esc(o.title)}" aria-pressed="${!!state.saved[o.id]}">${icon("bookmark")}</button>`;
  }
  function fit(o) {
    const p = state.profile,
      reasons = [];
    if ((p.interests || []).includes(o.interest))
      reasons.push(`Matches your interest in ${o.interest.toLowerCase()}`);
    if (p.grade && !o.grades.includes(p.grade))
      return "Example grade range differs from your profile.";
    if (p.weeklyHours && o.hours > Number(p.weeklyHours))
      reasons.push("Example time commitment exceeds your weekly hours");
    return (
      reasons.join(" Â· ") || "Explore the details and check your constraints."
    );
  }
  function opCard(o) {
    return `<article class="op-card card"><div class="card-top">${symbol(o)}${saveButton(o)}</div><p class="provider">${o.provider}</p><h2><a href="#/opportunities/${o.id}">${o.title}</a></h2><p>${fit(o)}</p><div class="card-meta"><span>${o.type} Â· ${o.mode}</span><span>Grades ${o.grades[0]}â€“12</span><span>Cost: ${o.cost}</span><span>Deadline: not applicable</span><span>${o.location}</span><span>~${o.hours} hrs/week, example</span></div><div class="card-bottom"><span>Fictional example</span><a class="text-link" href="#/opportunities/${o.id}">View details ${arrow}</a></div></article>`;
  }
  function filtered() {
    return D.opportunities.filter(
      (o) =>
        (!filters.q ||
          `${o.title} ${o.provider} ${o.interest} ${o.location} ${o.summary}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())) &&
        (!filters.type || o.type === filters.type) &&
        (!filters.interest || o.interest === filters.interest) &&
        (!filters.mode || o.mode === filters.mode) &&
        (!filters.grade || o.grades.includes(filters.grade)) &&
        (!filters.free || o.cost === "Free") &&
        (!filters.location || o.location === filters.location),
    );
  }
  function results() {
    const items = filtered();
    $("#result-count").textContent =
      `${items.length} example ${items.length === 1 ? "opportunity" : "opportunities"}`;
    $("#op-results").innerHTML = items.length
      ? items.map(opCard).join("")
      : `<div class="empty"><h2>No examples match yet.</h2><p>Try another interest or remove a filter.</p><button class="btn secondary" data-clear-filters>Clear filters</button></div>`;
  }
  function catalog() {
    return page(
      pageHead(
        "A place to begin",
        "Find your next possibility.",
        "An interest can turn into a project, a new skill, or a reason to try something different.",
        btn("Add an opportunity", "#/contribute", "secondary"),
      ) +
        notice(
          "This collection contains fictional examples, not live opportunities. No example is accepting applications.",
        ) +
        `<form id="filters" class="filters" role="search">${field("Search opportunities", "q", filters.q, "search", 'placeholder="Try computing, research, or a location"')}${select("Opportunity type", "type", [...new Set(D.opportunities.map((o) => o.type))], filters.type, "All types")}${select("Interest", "interest", D.interests, filters.interest, "All interests")}${select("Format", "mode", ["Virtual", "In person"], filters.mode, "Any format")}</form><div class="filter-extra"><div class="filter-options">${select("Eligible grade", "grade", ["9", "10", "11", "12"], filters.grade, "Any grade")}${select("Location", "location", ["United States", "Texas", "California"], filters.location, "All locations")}<label class="check-label"><input type="checkbox" name="free" ${filters.free ? "checked" : ""}> Free only</label><button class="text-link task-delete" data-clear-filters>Reset filters</button></div><span id="result-count" class="muted"></span></div><div class="grid-cards" id="op-results"></div>`,
    );
  }
  function detail(id) {
    const o = D.opportunities.find((o) => o.id === id);
    if (!o) return notFound();
    return page(
      `<a class="back" href="#/opportunities">â† All opportunities</a>` +
        pageHead(
          `${o.type} / Fictional example`,
          esc(o.title),
          esc(o.provider),
        ) +
        notice(
          "Illustration only. This listing has no official provider, application cycle, or application link. Do not use it to make a real application.",
        ) +
        `<div class="detail-layout"><div><dl class="facts">${[
          ["Format", o.mode],
          ["Location", o.location],
          ["Eligible grades", o.grades.join(", ")],
          ["Cost", o.cost],
          ["Time commitment", `~${o.hours} hours/week, illustrative`],
          ["Deadline / cycle", "Not applicable â€” fictional"],
          ["Source status", "Unverified example"],
          ["Last checked", "Not applicable"],
        ]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
          .join(
            "",
          )}</dl><section class="detail-block"><h2>What you could explore</h2><p>${o.summary}</p></section><section class="detail-block"><h2>Example preparation checklist</h2><ul>${o.requirements.map((r) => `<li>${r}</li>`).join("")}</ul></section><section class="detail-block"><h2>How this relates to your profile</h2><p>${fit(o)} Interest alone does not establish eligibility. Live listings will need reviewed official sources.</p><a class="text-link" href="#/settings">Review your profile ${arrow}</a></section><a class="text-link" href="#/contribute?correction=${o.id}">Suggest a correction ${arrow}</a></div><aside class="side-panel"><h2>Make a next step.</h2><p>Try saving this example and planning a personal task.</p><button class="btn secondary" data-save="${o.id}">${state.saved[o.id] ? "Remove saved example" : "Save opportunity"}</button><button class="btn" data-track="${o.id}">Track application <span aria-hidden="true">â†’</span></button><button class="btn secondary" disabled>Official application unavailable</button><a class="btn secondary" href="#/advisor?opportunity=${o.id}">Ask the advisor</a><p>Your saved status and notes stay in this browser.</p></aside></div>`,
    );
  }
  function choices(label, name, values, current = [], single = false) {
    return `<fieldset><legend>${label}</legend><div class="choices">${values.map((v) => `<label class="choice"><input type="${single ? "radio" : "checkbox"}" name="${name}" value="${esc(v)}" ${(single ? current === v : current.includes(v)) ? "checked" : ""}><span>${v}</span></label>`).join("")}</div></fieldset>`;
  }
  const STEPS = [
    "The basics",
    "Your interests",
    "Your time & budget",
    "Your experience",
    "Your goals",
    "Your starting point",
  ];
  function onboarding() {
    const p = state.profile,
      s = Math.min(5, Math.max(0, Number(state.step) || 0));
    let inner = "";
    if (s === 0)
      inner = `<div class="form-grid">${field("Preferred first name", "firstName", p.firstName, "text", 'maxlength="50" autocomplete="given-name" required')}${select("Grade", "grade", ["9", "10", "11", "12"], p.grade, "Choose your grade")}${field("Country", "country", p.country || "United States", "text", 'maxlength="80" required')}${field("State or broad region (optional)", "region", p.region, "text", 'maxlength="80"')}</div>`;
    if (s === 1)
      inner = `<div class="form-stack">${choices("Choose any interests, or keep exploring", "interests", D.interests, p.interests || [])}${field("Another interest (optional)", "customInterest", p.customInterest, "text", 'maxlength="100"')}</div>`;
    if (s === 2)
      inner = `<div class="form-grid">${field("Available hours per week (optional)", "weeklyHours", p.weeklyHours, "number", 'min="0" max="40" step="1"')}${select("Budget preference", "budget", ["Free opportunities", "Up to $100", "Up to $500", "Flexible / unsure"], p.budget, "No preference")}${select("Format preference", "format", ["Virtual", "In person", "Either"], p.format, "No preference")}${field("Travel region (optional)", "travel", p.travel, "text", 'maxlength="100" placeholder="For example, the Austin area"')}</div>`;
    if (s === 3)
      inner = `<div class="form-stack">${textarea("Activities, skills, awards, or leadership (optional)", "experience", p.experience, 'placeholder="Share what you want your plan to consider."')}${choices("Getting started is a valid starting point", "justStarting", ["Just getting started"], p.justStarting || [])}${notice("Resume import is not connected. PDF/DOCX extraction will require a secure backend; no file is uploaded in this preview.", true)}</div>`;
    if (s === 4)
      inner = choices(
        "What would you like to work toward? (optional)",
        "goals",
        [
          "Discover interests",
          "Deepen an activity",
          "Find volunteering",
          "Explore colleges",
          "Prepare applications",
        ],
        p.goals || [],
      );
    if (s === 5)
      inner = `<div class="review-list">${[
        [
          "Basics",
          [p.firstName, p.grade ? `Grade ${p.grade}` : "", p.country, p.region]
            .filter(Boolean)
            .join(" Â· "),
        ],
        [
          "Interests",
          [...(p.interests || []), p.customInterest]
            .filter(Boolean)
            .join(", ") || "Still exploring",
        ],
        [
          "Time & budget",
          [
            p.weeklyHours ? `${p.weeklyHours} hours/week` : "",
            p.budget,
            p.format,
            p.travel,
          ]
            .filter(Boolean)
            .join(" Â· ") || "No preferences yet",
        ],
        [
          "Experience",
          p.experience || (p.justStarting || []).join("") || "Not added",
        ],
        ["Goals", (p.goals || []).join(", ") || "Open to possibilities"],
      ]
        .map(
          ([k, v]) =>
            `<div class="review-row"><strong>${k}</strong><p>${esc(v)}</p></div>`,
        )
        .join(
          "",
        )}</div><p class="small muted" style="margin-top:20px">Your grade, interests, time, and budget inform simple fit notes. Editing this profile preserves your saved work.</p>`;
    return page(
      `<div class="onboarding-shell">${pageHead("Try the local preview", "Your path starts here.", "A few details can help you decide what to explore. You can change them anytime.")}${notice("Sign-in uses publik. Planning data stays in this browser and does not sync. Use sample information and avoid sensitive personal details.")}<div class="form-card"><div class="progress-row"><span>Step ${s + 1} of 6</span><span>Progress saved in this browser</span></div><div class="progress"><span style="width:${((s + 1) / 6) * 100}%"></span></div><h2>${STEPS[s]}</h2><p>${["Start with the details you want to use in this preview.", "You can have more than one interest. You can also be figuring it out.", "Make space for school, rest, and the things you already do.", "A short, self-written summary is enough.", "Choose what would make your next few weeks useful.", "Review your profile before browsing."][s]}</p><form id="onboarding-form">${inner}<div id="onboarding-error" class="error" role="alert"></div><div class="actions">${s ? '<button class="btn secondary" type="button" data-back-step>Back</button>' : '<a class="btn secondary" href="#/">Back to Sparrow</a>'}<button class="btn" type="submit">${s === 5 ? "Save & find opportunities" : "Save & continue"} <span aria-hidden="true">â†’</span></button></div></form></div></div>`,
    );
  }
  function savedView() {
    const entries = Object.entries(state.saved).filter(
      ([id, v]) =>
        D.opportunities.some((o) => o.id === id) &&
        (savedTab === "All saved" || v.status === savedTab),
    );
    return page(
      pageHead(
        "Make room for a next step",
        "My opportunities.",
        "Your personal workspace for saved possibilities, application progress, and the things you want to do next.",
        btn("Find opportunities", "#/opportunities", "secondary"),
      ) +
        notice(
          "You are tracking fictional examples in this browser. A status change does not submit a real application.",
          true,
        ) +
        `<div class="tabs" aria-label="Filter saved opportunities">${["All saved", ...D.statuses].map((s) => `<button class="tab ${savedTab === s ? "active" : ""}" data-saved-tab="${s}" aria-pressed="${savedTab === s}">${s}</button>`).join("")}</div>` +
        (entries.length
          ? entries
              .map(([id, v]) => {
                const o = D.opportunities.find((o) => o.id === id);
                return `<article class="saved-row"><div><div class="saved-title">${symbol(o)}<div><h2><a href="#/opportunities/${id}">${o.title}</a></h2><p>Fictional example Â· Saved ${new Date(v.savedAt).toLocaleDateString()}</p></div></div><div class="saved-fields">${textarea("Your private note", "note", v.note || "", `data-saved-field="note" data-id="${id}"`)}${field("Your personal due date", "due", v.due || "", "date", `data-saved-field="due" data-id="${id}"`)}</div><div class="tasks"><span class="small">Your next tasks</span>${(v.tasks || []).map((t) => `<div class="task-row"><label><input type="checkbox" data-task="${esc(t.id)}" data-id="${id}" ${t.done ? "checked" : ""}><span class="${t.done ? "done" : ""}">${esc(t.text)}</span></label><button class="task-delete" data-delete-task="${esc(t.id)}" data-id="${id}" aria-label="Delete task ${esc(t.text)}">Ã—</button></div>`).join("")}<form class="task-form" data-task-form="${id}"><input aria-label="New task for ${esc(o.title)}" name="task" placeholder="Add one practical next step" maxlength="200" required><button class="btn secondary small" type="submit">Add task</button></form></div></div><div class="saved-side">${select("Application status", `status-${id}`, D.statuses, v.status)}<p class="small muted">Personal dates are separate from official deadlines.</p><button class="text-link task-delete" data-save="${id}">Remove saved item</button></div></article>`;
              })
              .join("")
          : `<div class="empty"><h2>${savedTab === "All saved" ? "Start with one possibility." : "No items with this status."}</h2><p>${savedTab === "All saved" ? "Save an example opportunity and give it a practical next step." : "Change an application status or view all saved items."}</p>${btn("Find opportunities", "#/opportunities")}</div>`),
    );
  }
  function collegeCards() {
    const colleges = D.colleges.filter(
      (c) =>
        (!collegeFilters.q ||
          `${c.name} ${c.city}`
            .toLowerCase()
            .includes(collegeFilters.q.toLowerCase())) &&
        (!collegeFilters.saved || state.colleges[c.id]),
    );
    return colleges.length
      ? colleges
          .map(
            (c) =>
              `<article class="op-card card"><div class="card-top"><span class="college-mark ${c.color}">${c.initial}</span><button class="icon-button ${state.colleges[c.id] ? "saved" : ""}" data-college="${c.id}" aria-label="${state.colleges[c.id] ? "Unsave" : "Save"} ${c.name}" aria-pressed="${!!state.colleges[c.id]}">${icon("bookmark")}</button></div><p class="provider">${c.city}</p><h2><a href="#/colleges/${c.id}">${c.name}</a></h2><p>${c.note}</p><div class="card-bottom" style="margin-top:25px"><span>Example directory</span><a class="text-link" href="#/colleges/${c.id}">View college ${arrow}</a></div></article>`,
          )
          .join("")
      : `<div class="empty"><h2>${collegeFilters.saved ? "Your college list starts here." : "No colleges match."}</h2><p>Try a different search or view the example directory.</p><button class="btn secondary" data-reset-colleges>View all colleges</button></div>`;
  }
  function colleges() {
    return page(
      pageHead(
        "A wider view",
        "College Explorer.",
        "Start a college list, keep your questions, and follow official sources to learn more.",
      ) +
        notice(
          "Real college names are included as examples with official homepage links. Tuition, deadlines, admission statistics, and personalized predictions are not provided.",
        ) +
        `<div class="filters" style="grid-template-columns:1fr auto"><label class="field">Search colleges or locations<input id="college-search" type="search" value="${esc(collegeFilters.q)}" placeholder="Try Texas or a college name"></label><label class="check-label"><input type="checkbox" id="college-saved" ${collegeFilters.saved ? "checked" : ""}> My shortlist (${Object.keys(state.colleges).length})</label></div><div class="grid-cards" id="college-results">${collegeCards()}</div>`,
    );
  }
  function collegeDetail(id) {
    const c = D.colleges.find((c) => c.id === id);
    if (!c) return notFound();
    const v = state.colleges[id];
    return page(
      `<a class="back" href="#/colleges">â† All colleges</a>` +
        pageHead("College Explorer / Example record", c.name, c.city) +
        notice(
          "This is an illustrative directory record, not a complete or recently verified college profile. Check the collegeâ€™s official website for current information.",
        ) +
        `<div class="detail-layout"><div><div class="detail-block"><h2>Get to know the college.</h2><p>Explore official majors, application requirements, and financial aid information on the institution's website. Note the dates and sources of anything you plan to rely on.</p><a class="text-link" href="${c.url}" target="_blank" rel="noopener noreferrer">Open official college website ${arrow}<span class="small">(external)</span></a></div><div class="detail-block"><h2>Questions to take with you</h2><ul><li>Which programs connect with your interests?</li><li>What does financial aid require, and when?</li><li>What would you like to learn about student life?</li></ul><p>Current tuition, application dates, and source verification dates: not recorded.</p></div></div><aside class="side-panel"><h2>Your college list</h2><button class="btn" data-college="${id}">${v ? "Remove from shortlist" : "Save to shortlist"}</button>${v ? `<div class="college-notes">${textarea("Your notes", "collegeNote", v.note || "", `data-college-note="${id}" placeholder="Questions, interests, things to checkâ€¦"`)}</div>` : "<p>Save this college to keep your own notes.</p>"}<a class="btn secondary" href="#/advisor?college=${id}">Review advisor context</a></aside></div>`,
    );
  }
  const advisorTasks = [
    [
      "Build a realistic plan",
      "Turn your time and interests into a few practical next steps.",
    ],
    [
      "Compare saved choices",
      "Review selected opportunities against your constraints.",
    ],
    [
      "Break down a project",
      "Outline milestones for a project you want to start.",
    ],
    [
      "Review a draft",
      "Get clarity feedback while keeping your own authorship.",
    ],
  ];
  let advisorBusy = false;
  function advisorAnswer() {
    const a = state.advisor.answer;
    if (!a) return "";
    return `<section class="advisor-answer detail-block" aria-labelledby="answer-title"><div class="page-head"><h2 id="answer-title">Saved advisor response</h2><button class="btn secondary small" data-delete-answer>Delete response</button></div><p>${esc(a.summary)}</p><div class="form-stack" style="margin-top:24px">${a.recommendations.map((r) => `<article class="side-panel"><h3>${esc(r.title)}</h3><p>${esc(r.reason)}</p>${r.estimatedMinutes !== null ? `<p class="small">Estimated time: ${r.estimatedMinutes} minutes</p>` : ""}${r.uncertainties.length ? `<ul>${r.uncertainties.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}</article>`).join("")}</div>${a.followUpQuestion ? `<p style="margin-top:24px"><strong>One question:</strong> ${esc(a.followUpQuestion)}</p>` : ""}${a.warnings.length ? `<ul>${a.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}<p class="small muted" style="margin-top:24px">AI suggestions can be wrong. This response is saved only in this browser. ${state.advisor.providerRequestId ? "Provider request: " + esc(state.advisor.providerRequestId) : ""}</p></section>`;
  }
  function advisor() {
    const p = state.profile,
      q = new URLSearchParams(location.hash.split("?")[1] || ""),
      requested = q.get("opportunity"),
      college = q.get("college");
    state.advisor.opportunityIds ||= [];
    state.advisor.collegeIds ||= [];
    if (
      requested &&
      D.opportunities.some((o) => o.id === requested) &&
      !state.advisor.opportunityIds.includes(requested)
    ) {
      state.advisor.opportunityIds.push(requested);
      persist();
    }
    if (
      college &&
      D.colleges.some((c) => c.id === college) &&
      !state.advisor.collegeIds.includes(college)
    ) {
      state.advisor.collegeIds.push(college);
      persist();
    }
    if (requested || college) history.replaceState(null, "", "#/advisor");
    return page(
      pageHead(
        "Guidance with context",
        "A place to think ahead.",
        "Choose a task and prepare the context you would like your advisor to consider.",
      ) +
        notice(
          "AI is available through publik after an explicit request. This preview has no verified opportunity records, so guidance is limited to general planning and draft feedback. Fictional listings cannot support real application advice.",
        ) +
        `<div class="advisor-layout"><div><div class="advisor-actions">${advisorTasks.map(([t, d]) => `<button class="action-card ${state.advisor.task === t ? "active" : ""}" data-advisor-task="${t}" ${advisorBusy ? "disabled" : ""}><span class="symbol peach">${icon("spark")}</span><strong>${t}</strong><p>${d}</p></button>`).join("")}</div><form id="advisor-form" class="advisor-draft"><h2 style="font-size:25px">Your request draft</h2>${textarea("What would you like help with?", "draft", state.advisor.draft, 'placeholder="For example: help me choose a project that fits three hours a week."')}<label class="check-label" style="margin-top:20px"><input type="checkbox" name="confirmAi"> I confirm this AI request uses my selected provider and may consume its allowance.</label><div class="actions"><button class="btn secondary" type="submit" value="save">Save local draft</button><button class="btn" type="submit" value="send" ${advisorBusy || !publik.info.providerReady ? "disabled" : ""}>${advisorBusy ? "Request in progressâ€¦" : "Send to advisor"}</button></div><div id="advisor-error" class="error" role="alert"></div><p class="small muted" style="margin-top:14px">${publik.info.providerReady ? "The exact usage is determined by the provider. No Sparrow reward credits are spent." : "Add a personal publik key or connect your plan in Settings to send a request."}</p><p class="small muted" id="advisor-providers">AI providers: ${esc(publik.info.providers.join(", ") || "check your publik account for the current provider list")}.</p></form></div><aside class="side-panel"><h2>Review your context.</h2><p>Your task and draft are sent only when you confirm and choose Send. Include profile fields below only if useful.</p><div class="review-list" style="margin-top:25px"><div class="review-row"><label class="check-label"><input type="checkbox" name="includeProfile" checked> Include grade, interests, region, weekly hours, budget, and goals</label><p>${esc([p.grade ? `Grade ${p.grade}` : "No grade added", ...(p.interests || []), p.region || "", p.weeklyHours ? `${p.weeklyHours} hrs/week` : "", p.budget, ...(p.goals || [])].filter(Boolean).join(" Â· "))}</p><label class="check-label"><input type="checkbox" name="includeExperience"> Include my experience summary (first 1,500 characters)</label><p>${esc((p.experience || "No experience summary added.").slice(0, 1500))}</p></div><fieldset><legend>Saved examples (local context only)</legend>${
          D.opportunities
            .filter(
              (o) =>
                state.saved[o.id] ||
                state.advisor.opportunityIds.includes(o.id),
            )
            .map(
              (o) =>
                `<label class="check-label"><input type="checkbox" name="advisorContext" value="${o.id}" ${state.advisor.opportunityIds.includes(o.id) ? "checked" : ""}>${o.title}</label>`,
            )
            .join("") ||
          '<p class="small muted">Save an opportunity to include it in a future comparison.</p>'
        }</fieldset><fieldset><legend>College context</legend>${
          D.colleges
            .filter(
              (c) =>
                state.colleges[c.id] || state.advisor.collegeIds.includes(c.id),
            )
            .map(
              (c) =>
                `<label class="check-label"><input type="checkbox" name="advisorCollege" value="${c.id}" ${state.advisor.collegeIds.includes(c.id) ? "checked" : ""}>${c.name}</label>`,
            )
            .join("") ||
          '<p class="small muted">Save a college to prepare a comparison.</p>'
        }</fieldset></div><a class="text-link" href="#/settings">Edit your profile ${arrow}</a><p>Selected examples and college records remain local and are not sent as verified facts. Your profile name, account identifier, saved notes, and unrelated records are not automatically included.</p></aside></div>${advisorAnswer()}`,
    );
  }
  function contribute() {
    const edit = state.submissions.find((s) => s.id === editSubmission),
      q = new URLSearchParams(location.hash.split("?")[1] || ""),
      correction = q.get("correction");
    return page(
      pageHead(
        "Bring a possibility along",
        "Add an opportunity.",
        "Keep an official link and a few notes. You can edit your submission before a future review.",
      ) +
        notice(
          "Submissions are stored only in this browser. No page is fetched, nothing is published, and no moderation or credit reward takes place.",
        ) +
        `<div class="detail-layout"><div><form id="contribute-form" class="form-stack">${field("Official HTTPS URL", "url", edit?.url || "", "url", 'required maxlength="2000" placeholder="https://â€¦"')}${select("Opportunity type", "type", [...new Set(D.opportunities.map((o) => o.type))], edit?.type, "Choose a type")}${field("Opportunity title (optional)", "title", edit?.title, "text", 'maxlength="180"')}${textarea("Notes or suggested correction (optional)", "notes", edit?.notes || "")}<label class="check-label"><input name="confirm" type="checkbox" required ${edit ? "checked" : ""}> I believe this link is an official public source.</label>${correction ? `<input name="correction" type="hidden" value="${esc(correction)}">` : ""}<div id="submission-error" class="error" role="alert"></div><div class="actions"><button class="btn" type="submit">${edit ? "Save submission changes" : "Save pending submission"}</button>${edit ? '<button class="btn secondary" type="button" data-cancel-edit>Cancel edit</button>' : ""}</div></form></div><aside class="side-panel"><h2>What happens next?</h2><p>In production, the source will be safely fetched and extracted into a draft for review. A moderator must approve it before publication.</p><p>Rewards require an approved, useful, unique contribution and a funded policy. Pending submissions do not earn credits.</p><a class="text-link" href="#/credits">See credit details ${arrow}</a></aside></div><section class="submissions"><h2 style="font-size:28px">Your local submissions</h2>${state.submissions.length ? state.submissions.map((s) => `<article class="submission-row"><div><h3>${esc(s.title || "Untitled opportunity")}</h3><p>${esc(s.url)}</p><p>${esc(s.type)} Â· ${new Date(s.updatedAt).toLocaleDateString()}${s.correction ? " Â· Correction proposal" : ""}</p><span class="tag">Pending locally â€” not sent</span></div><div class="actions" style="margin-top:0"><button class="btn secondary small" data-edit-submission="${s.id}">Edit submission</button><button class="text-link task-delete" data-delete-submission="${s.id}">Delete</button></div></article>`).join("") : '<p class="muted" style="margin-top:20px">Your saved submissions will appear here.</p>'}</section>`,
    );
  }
  function credits() {
    return page(
      pageHead(
        "Your personal Sparrow credits",
        "A clear view of credits.",
        "Free organization stays free. Personalized AI actions will require an explicit credit entitlement.",
      ) +
        `<div class="wallet"><section class="balance-card"><p>Available Sparrow credits</p><div class="balance-number">0</div><p>No live wallet is connected. Sparrow credits are not cash or official publik API credits.</p><div class="actions"><button class="btn" disabled>Purchases unavailable</button></div></section><section class="side-panel"><h2>Share a possibility.</h2><p>You can copy a link to this preview. An invite does not grant credits or share your profile, notes, or account.</p><button class="btn secondary" data-share>Copy preview invite</button><p>Credit gifts and transfers are deferred. Never share a password or API key.</p></section></div><section class="ledger"><h2 style="font-size:28px">Credit categories</h2>${["Purchased entitlement", "Contribution rewards", "Promotional allowance", "Reserved usage", "Completed spend", "Refunds & expiry adjustments"].map((c) => `<div class="ledger-row"><span>${c}</span><span>0 credits</span></div>`).join("")}<p class="small muted" style="margin-top:20px">Preview values are fixed at zero. Production balances require a server-controlled transaction ledger.</p></section><section class="detail-block"><h2>Usage history</h2><p>No Sparrow transactions. Publik AI usage is billed separately by your selected provider. Sparrow purchases and transfers remain unavailable.</p></section>`,
    );
  }
  function showProviderError(error) {
    const target = $("#provider-feedback");
    target.textContent = error.message;
    if (error.topUpUrl) {
      const a = document.createElement("a");
      a.href = error.topUpUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "text-link";
      a.textContent = "Open publik";
      target.append(document.createElement("br"), a);
    }
  }
  function providerSettings() {
    const a = publik.info;
    return `<section class="side-panel" style="margin-top:30px"><h2>Sign-in & AI provider</h2><p>Signed in with publik${a.handle ? " as @" + esc(a.handle) : ""}. Provider choice: ${a.choice === "publik" ? "Connected publik plan" : "Personal publik API key"}.</p>${a.choice === "publik" && a.remainingPercent !== null ? `<p>${a.remainingPercent}% of your plan allowance remains.</p>` : ""}<div class="actions"><button class="btn secondary" data-provider="publik">Connect publik plan</button><button class="btn secondary" data-provider="own_key">Use my own key</button><button class="btn secondary" data-sign-out>Sign out of Sparrow</button></div><form id="personal-key-form" class="form-stack" style="margin-top:24px"><label class="field">Personal publik API key<input name="personalKey" type="password" autocomplete="off" spellcheck="false" required maxlength="260"><span class="hint">Sent only to Sparrow's server and kept in your encrypted session, never localStorage.</span></label><button class="btn secondary" type="submit">Save personal key</button></form><label class="check-label" style="margin-top:24px"><input type="checkbox" name="usageConsent" ${a.usageEnabled ? "checked" : ""}> Allow official publik usage counting</label><p id="provider-feedback" role="status" class="small muted"></p><p>Signing out leaves this account's local work in this browser. Other sign-ins receive separate workspaces. There is no cross-device profile storage yet.</p></section>`;
  }
  function legacyImportControl() {
    try {
      if (localStorage.getItem("sparrow.preview.v1"))
        return '<section class="side-panel" style="margin-top:30px"><h2>Earlier browser preview</h2><p>Your earlier unsigned preview is still stored in this browser. Import it only if it is your work. This replaces the current local workspace, and does not send it to AI.</p><button class="btn secondary" data-import-preview>Import earlier preview</button></section>';
    } catch {}
    return "";
  }
  function settings() {
    const p = state.profile;
    return page(
      pageHead(
        "Your profile & your data",
        "Keep your path yours.",
        "Review the details you chose to store and manage this browserâ€™s preview data.",
      ) +
        notice(
          "Sign-in is verified by publik. Profile data, saved work, submissions, and plans remain browser-local; they do not sync across devices. Use sample inputs and avoid sensitive information.",
        ) +
        `<div class="settings-grid"><section class="side-panel"><h2>${p.firstName ? esc(p.firstName) + "â€™s starting point" : "Your starting point"}</h2><p>${esc([p.grade ? `Grade ${p.grade}` : "Grade not set", p.region || p.country].filter(Boolean).join(" Â· "))}</p><p>${esc((p.interests || []).join(", ") || "Interests not set yet")}</p><p>${esc((p.goals || []).join(", ") || "Your goals are open.")}</p><a class="btn" href="#/onboarding" data-edit-profile>Edit local profile</a></section><section class="side-panel"><h2>Browser-local data</h2><p>${Object.keys(state.saved).length} saved opportunities Â· ${Object.keys(state.colleges).length} colleges Â· ${state.submissions.length} submissions</p><p>Export your local work or delete it from this browser. Downloads can contain the profile and notes you entered.</p><button class="btn secondary" data-export>Export local data</button><button class="btn secondary" data-clear-data>Delete local data</button></section></div>${providerSettings()}${legacyImportControl()}`,
    );
  }
  function notFound() {
    return page(
      `<div class="empty"><p class="kicker">Page not found</p><h1>Letâ€™s find your next step.</h1><p>This page is unavailable. Your saved work is still here.</p>${btn("Return to Sparrow", "#/")}</div>`,
    );
  }
  function render(focus = false) {
    nav();
    const r = route(),
      parts = r.split("/");
    let html;
    if (r === "/tour") html = tour();
    else if (r === "/") html = landing();
    else if (r === "/how-it-works") {
      html = landing();
    } else if (r === "/start" || r === "/onboarding") html = onboarding();
    else if (r === "/opportunities") html = catalog();
    else if (parts[1] === "opportunities" && parts[2]) html = detail(parts[2]);
    else if (r === "/saved") html = savedView();
    else if (r === "/colleges") html = colleges();
    else if (parts[1] === "colleges" && parts[2])
      html = collegeDetail(parts[2]);
    else if (r === "/advisor") html = advisor();
    else if (r === "/contribute") html = contribute();
    else if (r === "/credits") html = credits();
    else if (r === "/settings") html = settings();
    else if (r === "/review")
      html = page(
        pageHead(
          "Restricted access",
          "Moderator tools are unavailable.",
          "This local preview does not provide moderator roles or official approval actions.",
          btn("Return to opportunities", "#/opportunities"),
        ),
      );
    else html = notFound();
    $("#main").innerHTML = html;
    if (r === "/opportunities") results();
    if (!storageOK)
      $("#main").insertAdjacentHTML(
        "afterbegin",
        notice(
          "Browser storage is unavailable. Your work lasts for this visit only.",
        ),
      );
    document.title = `${{ "/opportunities": "Opportunities", "/saved": "My opportunities", "/colleges": "College Explorer", "/advisor": "AI Advisor", "/contribute": "Add opportunity", "/credits": "Credits", "/settings": "Settings", "/start": "Get started", "/onboarding": "Your profile" }[r] || "Find your next step"} â€” Sparrow`;
    if (focus) {
      window.scrollTo(0, 0);
      $("#main").focus({ preventScroll: true });
    }
    if (r === "/how-it-works") $("#how-it-works").scrollIntoView();
  }
  function addSaved(id) {
    if (!D.opportunities.some((o) => o.id === id)) return;
    state.saved[id] = {
      status: "Interested",
      note: "",
      due: "",
      tasks: [],
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  async function confirmRemoval(title, copy, label = "Remove item") {
    const dialog = $("#confirm-dialog"),
      prior = document.activeElement;
    $("#dialog-title").textContent = title;
    dialog.querySelector("p").textContent = copy;
    dialog.querySelector("[value=remove]").textContent = label;
    dialog.returnValue = "cancel";
    dialog.showModal();
    dialog.querySelector('button[value="cancel"]').focus();
    return new Promise((resolve) =>
      dialog.addEventListener(
        "close",
        () => {
          prior?.focus();
          resolve(dialog.returnValue === "remove");
        },
        { once: true },
      ),
    );
  }
  async function toggleSave(id) {
    if (!D.opportunities.some((o) => o.id === id)) return;
    const v = state.saved[id];
    if (
      v &&
      (v.note || v.due || (v.tasks || []).length) &&
      !(await confirmRemoval(
        "Remove saved work?",
        "Your notes, personal due date, and tasks for this item will also be removed.",
      ))
    )
      return;
    if (v) delete state.saved[id];
    else addSaved(id);
    persist();
    const y = scrollY;
    render();
    scrollTo(0, y);
    document
      .querySelector(`[data-save="${id}"]`)
      ?.focus({ preventScroll: true });
    toast(
      v
        ? "Removed from your saved opportunities."
        : "Saved to My opportunities.",
    );
  }
  function validURL(raw) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !host.includes(":") &&
        host.includes(".") &&
        !/^\d+(\.\d+){3}$/.test(host) &&
        !["localhost", "localhost.localdomain"].includes(host) &&
        ![".local", ".localhost", ".internal", ".test", ".invalid"].some((s) =>
          host.endsWith(s),
        )
      );
    } catch {
      return false;
    }
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("a,button");
    if (!t) return;
    if (t.matches(".skip")) {
      e.preventDefault();
      document.querySelector("#main").focus();
    } else if (t.matches("[data-top]")) {
      e.preventDefault();
      scrollTo({ top: 0, behavior: "smooth" });
    } else if (t.matches(".menu-toggle")) {
      const open = $(".nav").classList.toggle("open");
      t.setAttribute("aria-expanded", open);
      t.setAttribute(
        "aria-label",
        open ? "Close navigation" : "Open navigation",
      );
      t.textContent = open ? "Ã—" : "â˜°";
    } else if (t.dataset.save) await toggleSave(t.dataset.save);
    else if (t.dataset.track) {
      if (!state.saved[t.dataset.track]) addSaved(t.dataset.track);
      state.saved[t.dataset.track].status = "Preparing";
      state.saved[t.dataset.track].updatedAt = new Date().toISOString();
      persist();
      location.hash = "/saved";
      toast("Example added to Preparing. No application was submitted.");
    } else if (t.hasAttribute("data-clear-filters")) {
      filters = {
        q: "",
        type: "",
        interest: "",
        mode: "",
        grade: "",
        free: false,
        location: "",
      };
      render();
    } else if (t.dataset.savedTab) {
      savedTab = t.dataset.savedTab;
      render();
    } else if (t.hasAttribute("data-back-step")) {
      saveProfileForm();
      state.step = Math.max(0, state.step - 1);
      persist();
      render();
    } else if (t.dataset.college) {
      const id = t.dataset.college;
      if (!D.colleges.some((c) => c.id === id)) return;
      const exists = state.colleges[id];
      if (
        exists?.note &&
        !(await confirmRemoval(
          "Remove college notes?",
          "Removing this college also deletes its local notes.",
        ))
      )
        return;
      if (exists) delete state.colleges[id];
      else state.colleges[id] = { note: "", savedAt: new Date().toISOString() };
      persist();
      const y = scrollY;
      render();
      scrollTo(0, y);
      document
        .querySelector(`[data-college="${id}"]`)
        ?.focus({ preventScroll: true });
      toast(
        exists
          ? "College removed from your shortlist."
          : "College saved to your shortlist.",
      );
    } else if (t.hasAttribute("data-reset-colleges")) {
      collegeFilters = { q: "", saved: false };
      render();
    } else if (t.dataset.advisorTask) {
      state.advisor.task = t.dataset.advisorTask;
      state.advisor.draft = $('[name="draft"]').value;
      persist();
      render();
    } else if (t.hasAttribute("data-import-preview")) {
      if (
        !(await confirmRemoval(
          "Import earlier browser work?",
          "This replaces this sign-inâ€™s local profile, saved items, college notes, submissions, and draft. Import only work that belongs to you.",
          "Import preview",
        ))
      )
        return;
      try {
        const prior = JSON.parse(localStorage.getItem("sparrow.preview.v1"));
        if (
          prior?.version !== 1 ||
          !prior.profile ||
          !prior.saved ||
          !prior.colleges ||
          !Array.isArray(prior.submissions)
        )
          throw new Error();
        state = { ...clean(), ...prior };
        persist();
        render();
        toast("Earlier browser work imported into this local workspace.");
      } catch {
        toast(
          "The earlier preview could not be imported. Its data has not been deleted.",
        );
      }
    } else if (t.hasAttribute("data-delete-answer")) {
      state.advisor.answer = null;
      state.advisor.providerRequestId = null;
      persist();
      render();
      toast("Saved advisor response deleted.");
    } else if (t.dataset.provider) {
      try {
        await publik.setChoice(t.dataset.provider);
        render();
        toast("AI provider choice updated.");
      } catch (ex) {
        showProviderError(ex);
      }
    } else if (t.hasAttribute("data-sign-out")) {
      try {
        await publik.signOut();
      } catch (ex) {
        showProviderError(ex);
      }
    } else if (t.dataset.editSubmission) {
      editSubmission = t.dataset.editSubmission;
      render(true);
    } else if (t.hasAttribute("data-cancel-edit")) {
      editSubmission = null;
      render();
    } else if (t.dataset.deleteSubmission) {
      if (
        !(await confirmRemoval(
          "Delete local submission?",
          "This removes the saved submission from this browser. Nothing has been sent to a reviewer.",
        ))
      )
        return;
      state.submissions = state.submissions.filter(
        (s) => s.id !== t.dataset.deleteSubmission,
      );
      if (editSubmission === t.dataset.deleteSubmission) editSubmission = null;
      persist();
      render();
      toast("Local submission deleted.");
    } else if (t.dataset.deleteTask) {
      const v = state.saved[t.dataset.id];
      v.tasks = v.tasks.filter((x) => x.id !== t.dataset.deleteTask);
      v.updatedAt = new Date().toISOString();
      persist();
      render();
    } else if (t.hasAttribute("data-share")) {
      const url = new URL(location.href);
      url.hash = "/start";
      try {
        await navigator.clipboard.writeText(url.href);
        toast("Preview invite copied. Your local data is not included.");
      } catch {
        toast(
          "Clipboard unavailable. Copy the preview address from your browser.",
        );
      }
    } else if (t.hasAttribute("data-edit-profile")) {
      state.step = 0;
      persist();
      if (route() === "/onboarding") render();
    } else if (t.hasAttribute("data-export")) {
      const blob = new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "sparrow-local-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Local data exported.");
    } else if (t.hasAttribute("data-clear-data")) {
      if (
        !(await confirmRemoval(
          "Delete this workspaceâ€™s local data?",
          "This deletes this sign-inâ€™s local profile, saved work, college notes, submissions, and advisor draft. Other sign-ins and the earlier unsigned preview are not removed.",
        ))
      )
        return;
      try {
        localStorage.removeItem(KEY);
      } catch {}
      state = clean();
      render();
      toast("Your local preview data has been deleted.");
    }
  });
  function saveProfileForm() {
    const form = $("#onboarding-form");
    if (!form) return;
    const f = new FormData(form);
    for (const [key, value] of f.entries()) {
      if (["interests", "goals", "justStarting"].includes(key)) continue;
      state.profile[key] = String(value).trim();
    }
    for (const key of ["interests", "goals", "justStarting"])
      if (form.querySelector(`[name="${key}"]`))
        state.profile[key] = f.getAll(key);
    persist();
  }
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.closest("#filters")) {
      filters[t.name] = t.value;
      results();
    } else if (t.id === "college-search") {
      collegeFilters.q = t.value;
      $("#college-results").innerHTML = collegeCards();
    } else if (t.dataset.savedField) {
      const v = state.saved[t.dataset.id];
      v[t.dataset.savedField] = t.value;
      v.updatedAt = new Date().toISOString();
      persist();
    } else if (t.dataset.collegeNote) {
      state.colleges[t.dataset.collegeNote].note = t.value;
      persist();
    } else if (t.name === "draft") {
      state.advisor.draft = t.value;
      persist();
    } else if (t.closest("#onboarding-form")) saveProfileForm();
  });
  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.closest("#filters")) {
      filters[t.name] = t.value;
      results();
    } else if (
      ["grade", "location", "free"].includes(t.name) &&
      !t.closest("#onboarding-form")
    ) {
      filters[t.name] = t.type === "checkbox" ? t.checked : t.value;
      results();
    } else if (t.id === "college-saved") {
      collegeFilters.saved = t.checked;
      $("#college-results").innerHTML = collegeCards();
    } else if (t.name.startsWith("status-")) {
      const id = t.name.slice(7);
      if (state.saved[id] && D.statuses.includes(t.value)) {
        state.saved[id].status = t.value;
        state.saved[id].updatedAt = new Date().toISOString();
        persist();
        toast("Application status updated.");
        if (savedTab !== "All saved") render();
      }
    } else if (t.name === "usageConsent") {
      try {
        await publik.setUsage(t.checked);
        $("#provider-feedback").textContent = t.checked
          ? "Official usage counting enabled."
          : "Official usage counting disabled.";
      } catch (ex) {
        t.checked = !t.checked;
        showProviderError(ex);
      }
    } else if (t.name === "advisorContext" || t.name === "advisorCollege") {
      const key = t.name === "advisorContext" ? "opportunityIds" : "collegeIds";
      const selected = new Set(state.advisor[key] || []);
      if (t.checked) selected.add(t.value);
      else selected.delete(t.value);
      state.advisor[key] = [...selected];
      persist();
    } else if (t.dataset.task) {
      const task = state.saved[t.dataset.id]?.tasks.find(
        (x) => x.id === t.dataset.task,
      );
      if (task) {
        task.done = t.checked;
        state.saved[t.dataset.id].updatedAt = new Date().toISOString();
        persist();
        t.nextElementSibling.classList.toggle("done", t.checked);
      }
    }
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    if (form.method === "dialog") return;
    e.preventDefault();
    if (form.id === "filters") return;
    if (form.id === "onboarding-form") {
      if (state.step === 0 && !form.querySelector('[name="grade"]').value) {
        $("#onboarding-error").textContent = "Choose your grade to continue.";
        form.querySelector('[name="grade"]').focus();
        return;
      }
      saveProfileForm();
      if (state.step === 5) {
        state.onboarded = true;
        persist();
        location.hash = "/opportunities";
        toast("Your local profile is saved.");
      } else {
        state.step++;
        persist();
        render(true);
      }
    } else if (form.dataset.taskForm) {
      const text = new FormData(form).get("task").trim();
      if (!text) return;
      state.saved[form.dataset.taskForm].tasks.push({
        id: crypto.randomUUID(),
        text,
        done: false,
      });
      state.saved[form.dataset.taskForm].updatedAt = new Date().toISOString();
      persist();
      render();
      toast("Personal task added.");
    } else if (form.id === "advisor-form") {
      state.advisor.draft = new FormData(form).get("draft");
      persist();
      if (e.submitter?.value !== "send") {
        toast("Draft saved locally. No AI request was sent.");
        return;
      }
      if (advisorBusy) return;
      const error = form.querySelector("#advisor-error");
      error.textContent = "";
      if (!state.advisor.draft.trim()) {
        error.textContent = "Write a request before sending.";
        return;
      }
      if (!form.querySelector("[name=confirmAi]").checked) {
        error.textContent =
          "Confirm provider usage before sending this AI request.";
        return;
      }
      const p = state.profile,
        include = $("[name=includeProfile]").checked;
      const profile = {
        interests: include
          ? [
              ...(p.interests || []),
              ...(p.customInterest ? [p.customInterest] : []),
            ]
          : [],
        goals: include ? p.goals || [] : [],
      };
      if (include) {
        if (p.grade) profile.grade = p.grade;
        if (p.region) profile.region = p.region;
        if (
          p.weeklyHours !== " " &&
          p.weeklyHours !== undefined &&
          p.weeklyHours !== ""
        )
          profile.weeklyHours = Number(p.weeklyHours);
        if (p.budget) profile.budget = p.budget;
      }
      if ($("[name=includeExperience]").checked && p.experience)
        profile.activities = p.experience.slice(0, 1500);
      advisorBusy = true;
      form.querySelector("[value=send]").disabled = true;
      form.querySelector("[value=send]").textContent = "Request in progressâ€¦";
      try {
        const providersBefore = publik.info.providers.join(", ");
        await publik.refresh();
        if (providersBefore !== publik.info.providers.join(", ")) {
          form.querySelector("[name=confirmAi]").checked = false;
          $("#advisor-providers").textContent =
            "AI providers: " + publik.info.providers.join(", ") + ".";
          throw new Error(
            "The provider list changed. Review it and confirm again before sending.",
          );
        }
        const result = await publik.call("advisor", {
          request: {
            task: state.advisor.task,
            draft: state.advisor.draft,
            profile,
            requestId: crypto.randomUUID(),
            confirmed: true,
          },
        });
        if (!result.answer)
          throw new Error("Sign in again before sending an advisor request.");
        state.advisor.answer = result.answer;
        state.advisor.providerRequestId = result.providerRequestId;
        persist();
        advisorBusy = false;
        if (route() === "/advisor") render();
        toast("Advisor response saved in this browser.");
      } catch (ex) {
        if (route() === "/advisor") {
          const target = $("#advisor-error");
          target.textContent = ex.message;
          if (ex.topUpUrl) {
            const a = document.createElement("a");
            a.href = ex.topUpUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.className = "text-link";
            a.textContent = "Open publik";
            target.append(document.createElement("br"), a);
          }
        }
      } finally {
        advisorBusy = false;
        const send = $("#advisor-form [value=send]");
        if (send) {
          send.disabled = !publik.info.providerReady;
          send.textContent = "Send to advisor";
        }
      }
    } else if (form.id === "personal-key-form") {
      const input = form.querySelector("[name=personalKey]");
      const value = input.value;
      input.value = "";
      try {
        await publik.setOwnKey(value);
        render();
        toast("Personal key saved in your encrypted session.");
      } catch (ex) {
        showProviderError(ex);
      }
    } else if (form.id === "contribute-form") {
      const f = new FormData(form),
        url = String(f.get("url")).trim();
      if (!validURL(url)) {
        $("#submission-error").textContent =
          "Use an official public HTTPS website without a password, private host, or IP address.";
        form.querySelector('[name="url"]').focus();
        return;
      }
      if (!f.get("type")) {
        $("#submission-error").textContent = "Choose the opportunity type.";
        return;
      }
      const normalized = new URL(url);
      normalized.hash = "";
      normalized.hostname = normalized.hostname.toLowerCase();
      const duplicate = state.submissions.find(
        (s) => s.url === normalized.href && s.id !== editSubmission,
      );
      if (duplicate) {
        $("#submission-error").textContent =
          "This official link is already in your local submissions. Edit the existing submission below.";
        return;
      }
      const old = state.submissions.find((s) => s.id === editSubmission);
      const item = {
        id: old?.id || crypto.randomUUID(),
        url: normalized.href,
        type: f.get("type"),
        title: String(f.get("title")).trim(),
        notes: String(f.get("notes")).trim(),
        correction: f.get("correction") || old?.correction || null,
        status: "pending_local",
        createdAt: old?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (old) Object.assign(old, item);
      else state.submissions.push(item);
      editSubmission = null;
      persist();
      render();
      toast("Pending submission saved locally. It has not been sent.");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $(".nav")?.classList.contains("open")) {
      $(".nav").classList.remove("open");
      $(".menu-toggle").setAttribute("aria-expanded", "false");
      $(".menu-toggle").focus();
    }
  });
  window.addEventListener("hashchange", async () => {
    if (route() === "/advisor") {
      try {
        await publik.refresh();
      } catch {
        return;
      }
    }
    render(true);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY)
      toast("Preview data changed in another tab. Reload before editing.");
  });
  if (!state.tourDone && (!location.hash || location.hash === "#/")) {
    location.hash = "/tour";
  }
  render();
})();


