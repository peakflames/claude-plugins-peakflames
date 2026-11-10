// Clicking #boom throws data-n uncaught TypeErrors, one per task, each naming its own property
// (item1, item2, …) so the report and the manifest can be checked line by line.
document.getElementById('boom').addEventListener('click', () => {
  const n = Number(document.getElementById('boom').dataset.n);
  for (let i = 1; i <= n; i++) setTimeout(() => { const missing = undefined; return missing[`item${i}`]; }, i * 15);
  document.getElementById('status').textContent = `Threw ${n} errors`;
});
