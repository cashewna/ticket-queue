(function () {
  'use strict';

  var progress = document.getElementById('route-progress');
  var status = document.getElementById('route-status');

  function resetProgress() {
    if (progress) progress.classList.remove('is-active');
    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    document.querySelectorAll('form[aria-busy="true"]').forEach(function (form) {
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[data-label]').forEach(function (button) {
        button.textContent = button.dataset.label || '';
        button.disabled = false;
        button.classList.remove('is-loading');
      });
    });
  }

  function showProgress(message) {
    if (progress) progress.classList.add('is-active');
    if (status) {
      status.textContent = message;
      status.hidden = false;
    }
  }

  window.addEventListener('pageshow', resetProgress);

  var summary = document.getElementById('error-summary');
  if (summary) summary.focus();

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var link = target.closest('a');
    if (!link) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (_error) {
      return;
    }
    if (url.origin !== window.location.origin) return;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== ''
    ) {
      return;
    }
    showProgress('Loading…');
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.noLoading === 'true') return;

    var button = form.querySelector('button[type="submit"]');
    if (button && !button.disabled) {
      if (!button.dataset.label) button.dataset.label = button.textContent || '';
      button.textContent = 'Working…';
      button.disabled = true;
      button.classList.add('is-loading');
    }
    form.setAttribute('aria-busy', 'true');
    showProgress(form.method.toLowerCase() === 'get' ? 'Loading…' : 'Saving…');
  });
})();
