(() => {
  "use strict";

  const PAGE = document.body?.dataset?.page || "";
  const SESSION_LOCAL_KEY = "enterprise_session_teamleader_v1";
  const SESSION_SESSION_KEY = "enterprise_session_teamleader_tmp_v1";
  const TEAMLEADER_ACCOUNTS_KEY = "enterprise_teamleader_accounts_v1";
  const AGENT_ACCOUNTS_KEY = "enterprise_agent_accounts_v1";
  const ERP_KEY = "enterprise_erp_v1";
  const BRANCH_COUNT = 47;

  const $ = (selector, root = document) => root.querySelector(selector);

  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const loadJson = (key, fallback) => {
    const store = window.EnterpriseStore || null;
    if (store?.getJson) {
      const value = store.getJson(key, undefined);
      if (typeof value !== "undefined" && value !== null) return value;
    }
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return safeJsonParse(raw, fallback);
  };

  const saveJson = (key, value) => {
    const store = window.EnterpriseStore || null;
    if (store?.setJson) {
      store.setJson(key, value);
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  };

  const isoNow = () => new Date().toISOString();
  const makeId = (prefix, index) => `${prefix}${String(index).padStart(2, "0")}`;
  const formatInt = (n) => new Intl.NumberFormat("en-KE").format(Number(n || 0));

  const ensureERP = () => {
    const existing = loadJson(ERP_KEY, null);
    if (existing && typeof existing === "object" && Array.isArray(existing.branches) && existing.branches.length === BRANCH_COUNT) {
      let changed = false;
      for (const b of existing.branches) {
        if (!Array.isArray(b.phones)) {
          b.phones = [];
          changed = true;
        }
        if (!Array.isArray(b.soldPhones)) {
          b.soldPhones = [];
          changed = true;
        }
        if (!Array.isArray(b.inventory)) {
          b.inventory = [];
          changed = true;
        }
      }
      if (changed) {
        existing.lastUpdated = isoNow();
        saveJson(ERP_KEY, existing);
      }
      return existing;
    }
    const branches = Array.from({ length: BRANCH_COUNT }, (_, idx) => {
      const i = idx + 1;
      return {
        id: makeId("b", i),
        name: `Branch ${String(i).padStart(2, "0")}`,
        city: "",
        area: "",
        employees: 0,
        inventory: [],
        phones: [],
        soldPhones: [],
        transactions: [],
        txLog: [],
        damageLoss: [],
        financeSummary: { mpesaIn: 0, bankIn: 0, txCount: 0, lastTxAt: "" },
        ledger: { head: "GENESIS" },
        updatedAt: isoNow(),
      };
    });
    const seeded = { version: 1, lastUpdated: isoNow(), branches, departments: {} };
    saveJson(ERP_KEY, seeded);
    return seeded;
  };

  const getSession = () => {
    const session =
      safeJsonParse(sessionStorage.getItem(SESSION_SESSION_KEY), null) ||
      loadJson(SESSION_LOCAL_KEY, null);
    if (!session || typeof session !== "object") return null;
    if (!session.role || !session.userId) return null;
    return session;
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_SESSION_KEY);
  };

  const requireTeamLeader = () => {
    const session = getSession();
    if (!session || session.role !== "teamleader" || !session.branchId) {
      window.location.href = "teamleader-login.html";
      return null;
    }
    return session;
  };

  const loadTeamLeaderAccounts = () => {
    const accounts = loadJson(TEAMLEADER_ACCOUNTS_KEY, []);
    return Array.isArray(accounts) ? accounts : [];
  };

  const loadAgentAccounts = () => {
    const accounts = loadJson(AGENT_ACCOUNTS_KEY, []);
    return Array.isArray(accounts) ? accounts : [];
  };

  const getAccount = (session) =>
    loadTeamLeaderAccounts().find((a) => String(a.id || "") === String(session.userId || "")) || null;

  const phoneSerial = (phone) => String(phone?.sku || phone?.serviceCode || phone?.imei || phone?.serial || "").trim();
  const itemName = (item) => [item?.name || item?.model, item?.category || item?.color, item?.unit || item?.storage].filter(Boolean).join(" • ") || "—";
  const normalized = (value) => String(value || "").trim().toLowerCase();
  const isAllocated = (phone) => Boolean(phone?.assignedAgentId || phone?.assignedAgentName);

  const init = async () => {
    if (PAGE !== "teamleader-dashboard") return;

    await window.EnterpriseStore?.bootstrap?.([TEAMLEADER_ACCOUNTS_KEY, AGENT_ACCOUNTS_KEY, ERP_KEY]);
    const session = requireTeamLeader();
    if (!session) return;

    let erp = ensureERP();
    const account = getAccount(session);
    if (!account) {
      clearSession();
      window.location.href = "teamleader-login.html";
      return;
    }

    const badge = $("#teamleader-badge");
    const syncBtn = $("#teamleader-sync-btn");
    const logoutBtn = $("#teamleader-logout-btn");
    const indicator = $("#teamleader-indicator");
    const kpiAvailable = $("#tl-kpi-available");
    const kpiAllocated = $("#tl-kpi-allocated");
    const kpiAgents = $("#tl-kpi-agents");
    const kpiBranch = $("#tl-kpi-branch");
    const serialInput = $("#alloc-serial");
    const serialList = $("#phone-serial-list");
    const agentSelect = $("#alloc-agent");
    const agentName = $("#alloc-agent-name");
    const agentPhone = $("#alloc-agent-phone");
    const agentIdNo = $("#alloc-agent-idno");
    const notes = $("#alloc-notes");
    const saveBtn = $("#alloc-save-btn");
    const clearBtn = $("#alloc-clear-btn");
    const helper = $("#alloc-helper");
    const agentsTbody = $("#tl-agents-tbody");
    const phonesTbody = $("#tl-phones-tbody");

    const getBranch = () => (erp.branches || []).find((b) => b.id === session.branchId) || null;
    const branchAgents = () =>
      loadAgentAccounts()
        .filter((a) => String(a.branchId || "") === String(session.branchId || ""))
        .sort((a, z) => String(a.username || "").localeCompare(String(z.username || "")));
    const approvedAgents = () => branchAgents().filter((a) => String(a.status || "approved").toLowerCase() === "approved");

    const persist = async () => {
      erp.lastUpdated = isoNow();
      saveJson(ERP_KEY, erp);
      try {
        await window.EnterpriseStore?.flush?.();
      } catch {
        // Local save is already complete.
      }
    };

    const setHelper = (message, ok = false) => {
      if (!helper) return;
      helper.textContent = message || "";
      helper.style.color = ok ? "var(--ok)" : "";
    };

    const clearForm = () => {
      if (serialInput) serialInput.value = "";
      if (agentSelect) agentSelect.value = "";
      if (agentName) agentName.value = "";
      if (agentPhone) agentPhone.value = "";
      if (agentIdNo) agentIdNo.value = "";
      if (notes) notes.value = "";
      setHelper("");
    };

    const fillAgentDetails = () => {
      const selected = approvedAgents().find((a) => String(a.id || "") === String(agentSelect?.value || ""));
      if (!selected) return;
      if (agentName && !String(agentName.value || "").trim()) agentName.value = selected.name || selected.username || "";
      if (agentPhone && !String(agentPhone.value || "").trim()) agentPhone.value = selected.phone || selected.phoneNo || "";
      if (agentIdNo && !String(agentIdNo.value || "").trim()) agentIdNo.value = selected.idNumber || selected.idNo || "";
    };

    const findPhone = (branch, serialRaw) => {
      const serial = normalized(serialRaw);
      if (!serial) return null;
      return (
        (branch?.phones || []).find((p) => normalized(p.serial) === serial || normalized(p.imei) === serial) ||
        null
      );
    };

    const renderAgents = () => {
      const agents = branchAgents();
      if (agentSelect) {
        agentSelect.textContent = "";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Manual entry";
        agentSelect.appendChild(blank);
        for (const a of approvedAgents()) {
          const opt = document.createElement("option");
          opt.value = String(a.id || "");
          opt.textContent = String(a.username || a.email || a.id || "");
          agentSelect.appendChild(opt);
        }
      }

      if (!agentsTbody) return;
      agentsTbody.textContent = "";
      if (!agents.length) {
        agentsTbody.innerHTML = `<tr><td colspan="4" class="teamleader-empty">No agents are registered under this branch yet.</td></tr>`;
        return;
      }
      for (const a of agents) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
        tr.children[0].textContent = a.username || "—";
        tr.children[1].textContent = a.email || "—";
        tr.children[2].textContent = a.branchId || "—";
        tr.children[3].textContent = String(a.status || "approved");
        agentsTbody.appendChild(tr);
      }
    };

    const renderPhones = () => {
      const branch = getBranch();
      if (!branch) return;
      branch.phones = Array.isArray(branch.phones) ? branch.phones : [];
      const phones = branch.phones.slice().sort((a, z) => phoneSerial(a).localeCompare(phoneSerial(z)));
      const allocated = phones.filter(isAllocated).length;
      const available = Math.max(0, phones.length - allocated);
      const agents = approvedAgents();

      if (badge) badge.textContent = `${account.username || "Team Leader"} • ${branch.name || branch.id || ""}`.trim();
      if (kpiAvailable) kpiAvailable.textContent = formatInt(available);
      if (kpiAllocated) kpiAllocated.textContent = formatInt(allocated);
      if (kpiAgents) kpiAgents.textContent = formatInt(agents.length);
      if (kpiBranch) kpiBranch.textContent = branch.id || "—";

      if (serialList) {
        serialList.textContent = "";
        for (const p of phones) {
          const opt = document.createElement("option");
          opt.value = phoneSerial(p);
          serialList.appendChild(opt);
        }
      }

      if (!phonesTbody) return;
      phonesTbody.textContent = "";
      if (!phones.length) {
        phonesTbody.innerHTML = `<tr><td colspan="8" class="teamleader-empty">No branch products, services, assets, or tasks found. Add records in the Branch portal first.</td></tr>`;
        return;
      }

      for (const p of phones) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td class="num"></td><td></td><td></td><td></td><td></td><td></td>`;
        tr.children[0].textContent = phoneSerial(p) || "—";
        tr.children[1].textContent = itemName(p);
        tr.children[2].textContent = formatInt(Number(p.price || 0) || 0);
        tr.children[3].textContent = p.assignedAgentName || p.assignedAgentUsername || "Unassigned";
        tr.children[4].textContent = p.assignedAgentPhone || "—";
        tr.children[5].textContent = p.assignedAgentIdNumber || "—";
        tr.children[6].textContent = p.assignedAt ? new Date(p.assignedAt).toLocaleString() : "—";

        const actions = document.createElement("div");
        actions.className = "report-buttons";
        actions.style.justifyContent = "flex-start";

        const loadBtn = document.createElement("button");
        loadBtn.className = "btn";
        loadBtn.type = "button";
        loadBtn.textContent = "Edit";
        loadBtn.addEventListener("click", () => {
          if (serialInput) serialInput.value = phoneSerial(p);
          if (agentSelect) agentSelect.value = p.assignedAgentId || "";
          if (agentName) agentName.value = p.assignedAgentName || p.assignedAgentUsername || "";
          if (agentPhone) agentPhone.value = p.assignedAgentPhone || "";
          if (agentIdNo) agentIdNo.value = p.assignedAgentIdNumber || "";
          if (notes) notes.value = p.assignedNotes || "";
          setHelper("Loaded allocation for editing.", true);
        });
        actions.appendChild(loadBtn);

        if (isAllocated(p)) {
          const removeBtn = document.createElement("button");
          removeBtn.className = "btn";
          removeBtn.type = "button";
          removeBtn.textContent = "Unassign";
          removeBtn.addEventListener("click", async () => {
            p.assignedAgentId = "";
            p.assignedAgentUsername = "";
            p.assignedAgentName = "";
            p.assignedAgentPhone = "";
            p.assignedAgentIdNumber = "";
            p.assignedNotes = "";
            p.assignedBy = "";
            p.assignedAt = "";
            branch.updatedAt = isoNow();
            await persist();
            renderPhones();
            setHelper("Allocation removed.", true);
          });
          actions.appendChild(removeBtn);
        }

        tr.children[7].appendChild(actions);
        phonesTbody.appendChild(tr);
      }
    };

    const allocatePhone = async () => {
      const branch = getBranch();
      if (!branch) return;
      const serial = String(serialInput?.value || "").trim();
      const phone = findPhone(branch, serial);
      if (!serial) {
        setHelper("Enter the SKU, service code, serial, or task reference.");
        return serialInput?.focus?.();
      }
      if (!phone) {
        setHelper("Reference not found in this branch catalog or task inventory.");
        return serialInput?.focus?.();
      }

      const selectedAgent = approvedAgents().find((a) => String(a.id || "") === String(agentSelect?.value || ""));
      const name = String(agentName?.value || selectedAgent?.name || selectedAgent?.username || "").trim();
      const phoneNo = String(agentPhone?.value || selectedAgent?.phone || selectedAgent?.phoneNo || "").trim();
      const idNumber = String(agentIdNo?.value || selectedAgent?.idNumber || selectedAgent?.idNo || "").trim();
      const detail = String(notes?.value || "").trim();

      if (!name) {
        setHelper("Enter the agent name.");
        return agentName?.focus?.();
      }
      if (!phoneNo) {
        setHelper("Enter the agent contact.");
        return agentPhone?.focus?.();
      }
      if (!idNumber) {
        setHelper("Enter the agent ID number.");
        return agentIdNo?.focus?.();
      }

      phone.imei = phone.imei || phone.serial || serial;
      phone.sku = phone.sku || phone.serial || serial;
      phone.assignedAgentId = selectedAgent?.id || "";
      phone.assignedAgentUsername = selectedAgent?.username || "";
      phone.assignedAgentName = name;
      phone.assignedAgentPhone = phoneNo;
      phone.assignedAgentIdNumber = idNumber;
      phone.assignedNotes = detail;
      phone.assignedBy = account.username || account.email || account.id || "";
      phone.assignedAt = isoNow();
      branch.updatedAt = isoNow();
      await persist();
      renderPhones();
      clearForm();
      setHelper("Work allocated to agent.", true);
    };

    const sync = async () => {
      await window.EnterpriseStore?.refresh?.([TEAMLEADER_ACCOUNTS_KEY, AGENT_ACCOUNTS_KEY, ERP_KEY]);
      erp = loadJson(ERP_KEY, erp);
      renderAgents();
      renderPhones();
      if (indicator) {
        indicator.textContent = "Live";
        indicator.classList.remove("offline");
      }
    };

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        window.location.href = "teamleader-login.html";
      });
    }
    if (syncBtn) syncBtn.addEventListener("click", () => sync().catch(() => null));
    if (agentSelect) agentSelect.addEventListener("change", () => fillAgentDetails());
    if (saveBtn) saveBtn.addEventListener("click", () => allocatePhone().catch(() => null));
    if (clearBtn) clearBtn.addEventListener("click", () => clearForm());

    const store = window.EnterpriseStore || null;
    if (store?.subscribe) {
      store.subscribe((ev) => {
        if (ev?.key !== ERP_KEY && ev?.key !== AGENT_ACCOUNTS_KEY) return;
        erp = loadJson(ERP_KEY, erp);
        renderAgents();
        renderPhones();
      });
    }

    renderAgents();
    renderPhones();
  };

  init();
})();
