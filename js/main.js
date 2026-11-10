/* ==========================================================================
   FORNO DA VILA — interações
   1. Navegação (sombra ao fazer scroll, menu móvel, link ativo)
   2. Revelação de elementos ao fazer scroll
   3. Contagem decrescente do especial da semana
   4. Horário: destaque de hoje e estado "Aberto / Fechado"
   ========================================================================== */

(function () {
  'use strict';

  // Indica ao CSS que o JS está ativo (os elementos só ficam escondidos para animar se houver JS)
  document.documentElement.classList.add('js');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------------------------------------------------------------
     1. NAVEGAÇÃO
     --------------------------------------------------------------------- */
  function initNav() {
    const nav = $('#nav');
    const toggle = $('#navToggle');
    const menu = $('#navMenu');

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false);
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setOpen(false); });

    // Link ativo conforme a secção visível
    const links = $$('.nav__links a');
    const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  /* ---------------------------------------------------------------------
     2. REVELAÇÃO AO FAZER SCROLL
     Elementos irmãos entram em cascata. Depois da animação, a classe
     .reveal é removida para não interferir com os efeitos de hover.
     --------------------------------------------------------------------- */
  function initReveal() {
    const items = $$('.reveal');
    const show = (el) => {
      const siblings = $$(':scope > .reveal', el.parentElement);
      const index = Math.max(0, siblings.indexOf(el));
      const delay = Math.min(index * 0.1, 0.5);
      el.style.setProperty('--delay', `${delay}s`);
      el.classList.add('is-visible');
      setTimeout(() => {
        el.classList.remove('reveal', 'is-visible');
        el.style.removeProperty('--delay');
      }, (delay + 1) * 1000);
    };

    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.remove('reveal'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------------
     3. CONTAGEM DECRESCENTE — o especial termina no domingo às 13:00
     --------------------------------------------------------------------- */
  const SPECIAL_ENDS = { weekday: 0, hour: 13 };   // 0 = domingo

  function nextDeadline(now = new Date()) {
    const end = new Date(now);
    const daysAhead = (SPECIAL_ENDS.weekday - now.getDay() + 7) % 7;
    end.setDate(now.getDate() + daysAhead);
    end.setHours(SPECIAL_ENDS.hour, 0, 0, 0);
    if (end <= now) end.setDate(end.getDate() + 7);   // já passou → próxima semana
    return end;
  }

  function initCountdown() {
    const root = $('#countdown');
    if (!root) return;
    const units = {
      days: $('[data-unit="days"]', root),
      hours: $('[data-unit="hours"]', root),
      minutes: $('[data-unit="minutes"]', root),
      seconds: $('[data-unit="seconds"]', root)
    };
    let deadline = nextDeadline();

    const set = (el, value) => {
      if (el.textContent === value) return;
      el.textContent = value;
      if (reducedMotion) return;
      el.classList.remove('tick');
      void el.offsetWidth;          // reinicia a animação
      el.classList.add('tick');
    };

    const update = () => {
      let diff = deadline - new Date();
      if (diff <= 0) { deadline = nextDeadline(); diff = deadline - new Date(); }
      const s = Math.floor(diff / 1000);
      set(units.days, String(Math.floor(s / 86400)));
      set(units.hours, pad(Math.floor((s % 86400) / 3600)));
      set(units.minutes, pad(Math.floor((s % 3600) / 60)));
      set(units.seconds, pad(s % 60));
    };
    update();
    setInterval(update, 1000);
  }

  /* ---------------------------------------------------------------------
     4. HORÁRIO — destaca o dia de hoje e indica se está aberto
     Lê as horas diretamente da tabela, por isso basta editar o HTML.
     --------------------------------------------------------------------- */
  function parseHours(text) {
    const match = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;   // ex.: "Encerrado"
    const [, h1, m1, h2, m2] = match.map(Number);
    return { open: h1 * 60 + m1, close: h2 * 60 + m2, openText: `${pad(h1)}:${pad(m1)}`, closeText: `${pad(h2)}:${pad(m2)}` };
  }

  function initHours() {
    const rows = $$('.hours__table tr[data-day]');
    const status = $('#openStatus');
    if (!rows.length || !status) return;
    const rowFor = (day) => rows.find((r) => Number(r.dataset.day) === day);

    const update = () => {
      const now = new Date();
      const today = now.getDay();
      const minutes = now.getHours() * 60 + now.getMinutes();
      rows.forEach((r) => r.classList.toggle('is-today', Number(r.dataset.day) === today));

      const todayHours = parseHours(rowFor(today).querySelector('td').textContent);
      if (todayHours && minutes >= todayHours.open && minutes < todayHours.close) {
        status.textContent = `Aberto agora · fecha às ${todayHours.closeText}`;
        status.className = 'status status--open';
        return;
      }

      // Fechado: procura a próxima abertura
      let label = 'Fechado';
      if (todayHours && minutes < todayHours.open) {
        label = `Fechado · abre às ${todayHours.openText}`;
      } else {
        for (let i = 1; i <= 7; i++) {
          const next = parseHours(rowFor((today + i) % 7).querySelector('td').textContent);
          if (next) {
            label = `Fechado · abre ${i === 1 ? 'amanhã' : rowFor((today + i) % 7).querySelector('th').textContent.toLowerCase()} às ${next.openText}`;
            break;
          }
        }
      }
      status.textContent = label;
      status.className = 'status status--closed';
    };
    update();
    setInterval(update, 60000);
  }

  /* ---------------------------------------------------------------------
     ARRANQUE
     --------------------------------------------------------------------- */
  initNav();
  initReveal();
  initCountdown();
  initHours();
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
