// Export LinkedIn (best-effort) — à coller dans la console de votre navigateur CONNECTÉ à LinkedIn,
// sur une page .../recent-activity/{all,comments,reactions}/ ou /company/<slug>/posts/.
// Change PROFIL et ONGLET (reactions | partages | commentaires | publications), puis copiez le JSON
// dans un fichier posts.json (concaténez les tableaux de plusieurs pages en un seul).
(() => {
  const PROFIL = "Lisa Neveu", ONGLET = "publications";
  const posts = [...document.querySelectorAll('[data-urn*="activity"]')].map(el => {
    const urn = el.getAttribute('data-urn');
    const t = el.innerText.replace(/\s+\n/g, '\n').trim();
    const heure = (t.match(/\b(\d+\s?(min|mn|h|j|sem|mois|an)s?)\b/i) || [''])[0];
    return { profil: PROFIL, onglet: ONGLET, auteur: t.split('\n')[0], heure,
             texte: t, url: 'https://www.linkedin.com/feed/update/' + urn + '/' };
  });
  const uniq = posts.filter((p, i, a) => a.findIndex(q => q.url === p.url) === i);
  copy(JSON.stringify(uniq, null, 2)); console.log(uniq.length + ' posts copiés');
})();
