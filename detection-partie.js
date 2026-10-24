// Extrait [{bt, att}] (BattleTag, code attribut du héros) du JSON produit par
// `HeroesDecode get-pregame-json`. Isolé de main.js pour être testable avec node seul
// (voir sortie/overlay-test/).
function extraireJoueurs(texteJson) {
  const d = JSON.parse(texteJson);
  return (d.Players || [])
    .map(j => ({ bt: j.BattleTagName || "", att: (j.PlayerHero || {}).HeroAttributeId || "" }))
    .filter(j => j.bt && j.att);
}

module.exports = { extraireJoueurs };
