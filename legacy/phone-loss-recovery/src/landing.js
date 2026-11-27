// Shared by the static build and the mounted module so the finders work before hydration.
export function landingHTML({ brand, home, navigator, practice, evidence, methodology, study }) {
  const finders = [
    ["Apple", "Apple Find Devices for iPhone", "https://www.icloud.com/find"],
    ["Samsung", "Samsung Find for Galaxy", "https://samsungfind.samsung.com/"],
    ["Google", "Google Find Hub for Android", "https://android.com/find"],
  ];
  return `<header class="plr-header">
    <a class="plr-brand" href="${home}">${brand}</a>
    <button type="button" data-size hidden aria-pressed="false">Larger text</button>
    <nav aria-label="Recovery navigation"><a href="${navigator}">Navigator</a><a href="${practice}">Practice</a><a href="${evidence}">Evidence</a><a href="${study}">Study</a><a href="${methodology}">Methodology</a></nav>
  </header>
  <div class="plr-content">
    <section class="plr-hero" aria-labelledby="plr-home-heading">
      <p class="plr-eyebrow">Phone lost. Keep the next step clear.</p>
      <h1 id="plr-home-heading">Phone unavailable?<br>Start with what you still have.</h1>
      <p>See what your carrier asks for and which steps you can take with the devices, ID, or account access you still have.</p>
      <div class="plr-actions"><a class="plr-primary" href="${navigator}">Explore my recovery options</a><a class="plr-button" href="${practice}">Practice a fictional situation</a></div>
      <small>Free to use. No sign-up. No phone number needed.</small>
    </section>
    <div class="plr-grid">
      <article class="plr-card"><span class="plr-eyebrow" aria-hidden="true">01</span><h2>Choose your situation</h2><p>Select your carrier, plan, and role on the account.</p></article>
      <article class="plr-card"><span class="plr-eyebrow" aria-hidden="true">02</span><h2>Check the guidance</h2><p>See what your carrier documents and which questions to ask support.</p></article>
      <article class="plr-card"><span class="plr-eyebrow" aria-hidden="true">03</span><h2>Keep your checklist</h2><p>Print the steps, questions, and official links for your situation.</p></article>
    </div>
    <section class="plr-home-help"><h2>Need help right now?</h2>
      <div class="plr-home-shortcuts"><button type="button" data-entry="stolen" disabled>I think it was stolen</button><a id="plr-home-choices" href="#plr-finders">I left it somewhere</a><button type="button" data-entry="story" disabled>Tell us what happened</button></div>
      <p role="status" class="plr-load-status"></p>
      <noscript><p>Enable JavaScript for guided help, or open an official device finder below.</p></noscript>
      <h3 id="plr-finders" tabindex="-1">Official device finders</h3>
      <div class="plr-home-shortcuts">${finders.map(([label, name, url]) => `<a href="${url}" aria-label="${name}" rel="noreferrer">${label} <span aria-hidden="true">↗</span></a>`).join("")}</div>
      <a class="plr-finder-back" href="#plr-home-choices">← Back to choices</a>
    </section>
  </div>
  <footer class="plr-footer">Independent educational project by Abhishek Vaishnav.
    <a href="https://doi.org/10.5281/zenodo.24301157">Research preprint</a> ·
    <a href="https://github.com/abhs007/phone-loss-recovery">Source and contributions</a>
    <p>Code MIT · Original educational content CC BY 4.0 · Third-party rights retained.</p></footer>`;
}
