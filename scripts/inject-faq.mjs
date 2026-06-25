/**
 * Script de migration one-shot : injecte les blocs FAQ dans les articles existants.
 * Exécuter une seule fois : node scripts/inject-faq.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function schema(faq) {
  const entities = faq
    .map(q => `    { "@type": "Question", "name": ${JSON.stringify(q.q)}, "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(q.a)} } }`)
    .join(',\n');
  return `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${entities}
    ]
  }
  </script>`;
}

function html(faq, label) {
  const heading = label ? `Questions fréquentes sur ${esc(label)}` : 'Questions fréquentes';
  const items = faq.map(q => `        <details class="faq-item">
          <summary>${esc(q.q)}</summary>
          <div class="faq-answer"><p>${esc(q.a)}</p></div>
        </details>`).join('\n');
  return `        <div class="faq-section">
          <h2>${heading}</h2>
${items}
        </div>`;
}

async function inject(filePath, faq, label) {
  let content = await readFile(filePath, 'utf-8');
  if (content.includes('faq-section') || content.includes('"FAQPage"')) {
    console.log(`SKIP ${filePath}`);
    return;
  }
  content = content.replace('</head>', `${schema(faq)}\n</head>`);
  content = content.replace('        <div class="tip">', `${html(faq, label)}\n\n        <div class="tip">`);
  await writeFile(filePath, content, 'utf-8');
  console.log(`OK   ${filePath}`);
}

// ─── DESTINATIONS ────────────────────────────────────────────────────────────

const destinations = [
  {
    slug: 'islande',
    label: "l'Islande",
    faq: [
      { q: "Faut-il un visa pour aller en Islande ?", a: "Non, les citoyens français n'ont pas besoin de visa pour l'Islande. L'Islande est membre de l'espace Schengen : un passeport ou une carte d'identité valide suffit pour des séjours touristiques." },
      { q: "Quelle est la meilleure saison pour visiter l'Islande ?", a: "L'été (juin-août) offre les nuits blanches, un accès à toutes les routes et des températures douces (10-15°C). L'hiver (novembre-février) est idéal pour observer les aurores boréales, faire du ski et profiter des hot springs sous la neige." },
      { q: "Combien coûte un voyage en Islande ?", a: "L'Islande est l'une des destinations les plus chères d'Europe. Comptez environ 150-200 € par personne et par jour (hébergement, repas, carburant, activités). Louer une voiture et cuisiner soi-même permet de réduire sensiblement le budget." },
      { q: "Faut-il louer un 4x4 en Islande ?", a: "Un 4x4 est fortement recommandé, surtout si vous prévoyez d'emprunter les pistes des Hautes Terres (routes F, ouvertes seulement en été). Pour la Ring Road et les sites principaux, une voiture classique suffit en été." },
      { q: "Peut-on voir les aurores boréales en Islande en été ?", a: "Non, les aurores boréales ne sont visibles qu'en hiver, lorsque les nuits sont suffisamment sombres. La meilleure fenêtre se situe d'octobre à mars, avec un pic d'activité autour des équinoxes." },
    ],
  },
  {
    slug: 'japon',
    label: 'le Japon',
    faq: [
      { q: "Faut-il un visa pour aller au Japon ?", a: "Les ressortissants français n'ont pas besoin de visa pour le Japon pour des séjours touristiques jusqu'à 90 jours. Votre passeport valide suffit. Un formulaire d'arrivée doit être rempli avant l'atterrissage." },
      { q: "Quelle est la meilleure période pour visiter le Japon ?", a: "Le printemps (fin mars à début mai) pour les cerisiers en fleurs et l'automne (octobre-novembre) pour les feuillages rouges et dorés sont les périodes les plus populaires. L'hiver est idéal pour les sports d'hiver à Hokkaido et pour éviter les foules." },
      { q: "Combien coûte un voyage au Japon ?", a: "Comptez environ 80-120 € par personne et par jour (hébergement moyen de gamme, repas, transports internes). Le Japan Rail Pass est essentiel pour se déplacer entre les villes à moindre coût si vous couvrez plusieurs destinations." },
      { q: "Quelle est la monnaie au Japon et peut-on payer par carte ?", a: "La monnaie est le yen japonais (JPY). Le Japon reste très orienté cash : gardez toujours des yens sur vous. Les distributeurs dans les 7-Eleven et autres convenience stores acceptent les cartes étrangères 24h/24." },
      { q: "Combien de jours faut-il pour visiter le Japon ?", a: "Deux semaines sont idéales pour un premier voyage couvrant Tokyo, Nikko ou Hakone, Kyoto, Nara et Osaka. Trois semaines permettent d'ajouter Hiroshima, Miyajima et éventuellement l'île de Kyushu ou Hokkaido." },
    ],
  },
  {
    slug: 'maroc',
    label: 'le Maroc',
    faq: [
      { q: "Faut-il un visa pour aller au Maroc ?", a: "Non, les citoyens français n'ont pas besoin de visa pour le Maroc. Vous pouvez séjourner jusqu'à 90 jours avec un passeport valide. La carte d'identité nationale française n'est plus acceptée depuis 2022 : le passeport est obligatoire." },
      { q: "Quelle est la meilleure saison pour visiter le Maroc ?", a: "Le printemps (mars-mai) et l'automne (septembre-novembre) sont idéaux : températures douces (20-25°C) et peu d'affluence. Évitez juillet-août dans les villes intérieures comme Marrakech où les températures peuvent dépasser 40°C." },
      { q: "Combien coûte un voyage au Maroc ?", a: "Le Maroc est une destination abordable. Comptez 50-80 € par personne et par jour pour un voyage confortable incluant hébergement en riad, repas au restaurant et entrées de sites. Le marchandage est courant dans les souks." },
      { q: "Quelle est la monnaie au Maroc ?", a: "La monnaie est le dirham marocain (MAD). Le dirham n'est pas convertible à l'étranger : attendez d'être sur place pour en obtenir. Les bureaux de change dans les aéroports et les banques en ville sont fiables. Évitez les changeurs non officiels dans la rue." },
      { q: "Est-il sûr de voyager seul au Maroc ?", a: "Le Maroc est globalement sûr pour les touristes. Restez vigilant contre les pickpockets dans les médinas bondées, méfiez-vous des faux guides et des arnaques à la boutique. Les femmes voyageant seules peuvent être sujettes à du harcèlement : tenez-vous à l'écart des ruelles isolées la nuit." },
    ],
  },
  {
    slug: 'pantanal',
    label: 'le Pantanal',
    faq: [
      { q: "Quelle est la meilleure période pour visiter le Pantanal ?", a: "La saison sèche (juillet-octobre) est idéale pour observer la faune : les animaux se concentrent autour des points d'eau, rendant les safaris bien plus productifs. La saison des pluies (novembre-mars) offre un paysage verdoyant mais nuit à la visibilité et à l'accès des pistes." },
      { q: "Faut-il un visa pour aller au Brésil ?", a: "Depuis 2024, les ressortissants français n'ont pas besoin de visa pour le Brésil pour des séjours touristiques jusqu'à 90 jours. Un passeport valide suffit." },
      { q: "Comment se rendre au Pantanal ?", a: "La porte d'entrée principale est Cuiabá (Pantanal Nord) ou Campo Grande (Pantanal Sud). Les deux villes sont desservies par vols depuis São Paulo ou Rio. Depuis l'Europe, une correspondance est nécessaire, généralement à São Paulo ou Lisbonne." },
      { q: "Quels animaux peut-on observer au Pantanal ?", a: "Le Pantanal est le meilleur endroit au monde pour observer le jaguar à l'état sauvage. On y croise aussi capybaras, caïmans, tapirs, loutres géantes, anacondas et plus de 650 espèces d'oiseaux dont le jabiru, emblème de la région." },
      { q: "Combien coûte un safari au Pantanal ?", a: "Les lodges organisent des safaris photo à partir de 150-250 € par nuit tout compris (hébergement, repas, excursions guidées en bateau et en 4x4). Le niveau de confort et les chances d'observer le jaguar varient fortement selon les établissements et leur emplacement." },
    ],
  },
  {
    slug: 'perou',
    label: 'le Pérou',
    faq: [
      { q: "Faut-il un visa pour aller au Pérou ?", a: "Non, les ressortissants français peuvent entrer au Pérou sans visa pour un séjour touristique jusqu'à 90 jours. Un passeport valide est suffisant." },
      { q: "Quelle est la monnaie au Pérou ?", a: "La monnaie est le sol péruvien (PEN). Les distributeurs automatiques sont disponibles dans les grandes villes. Le dollar américain est largement accepté dans les zones touristiques, mais il est préférable de payer en soles pour les petits achats." },
      { q: "Comment éviter le mal des montagnes au Pérou ?", a: "Cusco est à 3 400 m d'altitude. Accordez-vous 1-2 jours d'acclimatation à l'arrivée, hydratez-vous abondamment, évitez l'alcool les premiers jours et buvez du thé de coca, très efficace contre le soroche. En cas de symptômes persistants, descendez en altitude." },
      { q: "Combien de jours faut-il pour visiter le Machu Picchu ?", a: "Prévoyez au minimum 5-7 jours pour Lima + Cusco + Machu Picchu. Ajoutez 2-3 jours pour la Vallée Sacrée ou 4 jours de trek minimum si vous souhaitez faire l'Inca Trail, qu'il faut réserver des mois à l'avance." },
      { q: "Quelle est la meilleure saison pour visiter le Pérou ?", a: "La saison sèche (mai-octobre) est idéale, surtout pour le Machu Picchu et les randonnées dans les Andes. Évitez janvier-mars pour les zones de montagne : c'est la saison des pluies et les sentiers peuvent être glissants ou fermés." },
    ],
  },
  {
    slug: 'portugal',
    label: 'le Portugal',
    faq: [
      { q: "Faut-il un visa pour aller au Portugal ?", a: "Non, le Portugal fait partie de l'espace Schengen. Les citoyens français peuvent y voyager librement avec leur carte d'identité ou passeport valide, sans durée limite de séjour touristique." },
      { q: "Quelle est la meilleure saison pour visiter le Portugal ?", a: "Le printemps (avril-juin) et l'automne (septembre-octobre) offrent le meilleur compromis : températures agréables (20-25°C), peu de foule et tarifs raisonnables. L'été est magnifique mais très touristique et chaud, surtout à Lisbonne et en Algarve." },
      { q: "Combien coûte un voyage au Portugal ?", a: "Le Portugal est l'une des destinations les plus abordables d'Europe occidentale. Comptez 70-100 € par personne et par jour pour un voyage confortable. Les hébergements et restaurants restent nettement moins chers qu'en France, même à Lisbonne ou Porto." },
      { q: "Vaut-il mieux visiter Lisbonne ou Porto ?", a: "Les deux méritent le détour. Lisbonne est plus grande, cosmopolite et offre une vie nocturne animée. Porto est plus authentique, plus compact et souvent préférée pour son atmosphère de quartier. Si vous avez le temps, combinez les deux : elles ne sont qu'à 3h de train." },
      { q: "Combien de jours faut-il pour visiter Lisbonne ?", a: "3-4 jours suffisent pour explorer les quartiers principaux de Lisbonne : Alfama, Belém, Bairro Alto et le Chiado. Ajoutez une journée pour une excursion à Sintra ou Cascais, à 40 minutes en train depuis le centre." },
    ],
  },
  {
    slug: 'tanzanie',
    label: 'la Tanzanie',
    faq: [
      { q: "Faut-il un visa pour aller en Tanzanie ?", a: "Oui, un visa est obligatoire pour entrer en Tanzanie. Depuis 2024, il est possible d'obtenir un e-visa en ligne avant le départ sur le portail officiel du gouvernement tanzanien (eservices.immigration.go.tz). Le coût est d'environ 50 USD pour les touristes." },
      { q: "Quelle est la meilleure période pour voir la Grande Migration en Tanzanie ?", a: "La Grande Migration se déroule toute l'année, mais les meilleures périodes sont janvier-mars dans le Serengeti sud pour les naissances de gnous, et juillet-octobre pour la traversée de la rivière Mara, souvent considérée comme le spectacle le plus saisissant." },
      { q: "Combien coûte un safari en Tanzanie ?", a: "Un safari en Tanzanie représente un investissement conséquent. Comptez entre 300 et 800 € par personne et par nuit selon le niveau des lodges et camps, incluant hébergement, repas, sorties game drive et droits d'entrée dans les parcs." },
      { q: "Quelle est la monnaie en Tanzanie ?", a: "La monnaie est le shilling tanzanien (TZS). Le dollar américain est largement accepté dans les hôtels et lodges. Prévoyez du cash, les distributeurs automatiques sont rares en dehors de Dar es Salaam et Arusha." },
      { q: "Le Kilimandjaro est-il accessible sans expérience d'alpinisme ?", a: "Oui, l'ascension du Kilimandjaro ne nécessite pas de techniques d'alpinisme, mais une bonne condition physique et une acclimatation rigoureuse. La route Marangu (6 nuits) est la plus accessible. La route Lemosho (8 nuits) offre un meilleur taux de réussite grâce à une acclimatation progressive." },
    ],
  },
];

// ─── TIPS ─────────────────────────────────────────────────────────────────────

const tips = [
  {
    slug: 'city-trip-express-en-europe-le-guide-ultime-pour-un-week-end-memorable',
    label: 'le city trip en Europe',
    faq: [
      { q: "Combien de jours faut-il pour un city trip en Europe ?", a: "2 à 3 jours suffisent pour explorer l'essentiel d'une ville européenne de taille moyenne (Bruges, Séville, Budapest). Pour les grandes capitales comme Rome, Prague ou Berlin, prévoyez 4-5 jours pour ne pas courir." },
      { q: "Quand réserver ses billets d'avion pour un city trip ?", a: "Réservez entre 4 et 8 semaines à l'avance pour obtenir les meilleurs tarifs sur les lignes européennes. Les low-cost proposent souvent des promotions flash le mardi ou mercredi. Les alertes de prix sur Google Flights sont très efficaces." },
      { q: "Comment trouver un hébergement pas cher pour un week-end en Europe ?", a: "Les auberges de jeunesse en centre-ville offrent un excellent rapport qualité-prix pour les voyageurs solos ou en groupe. Les appartements en location courte durée battent souvent les hôtels sur le prix dès que vous êtes plusieurs." },
      { q: "Quelles villes européennes pour un city trip depuis Paris ?", a: "Amsterdam (vol ou train), Bruxelles (Thalys 1h20), Londres (Eurostar 2h15), Barcelone et Madrid (avion 2h) sont parmi les plus populaires. Bruxelles et Amsterdam sont les plus économiques à atteindre en train." },
    ],
  },
  {
    slug: 'comment-eviter-et-gerer-le-decalage-horaire-lors-d-un-voyage',
    label: 'le décalage horaire',
    faq: [
      { q: "Combien de temps faut-il pour récupérer du décalage horaire ?", a: "En règle générale, comptez environ 1 jour de récupération par heure de décalage. Un vol Paris-Tokyo (9h de décalage) implique environ une semaine pour une adaptation complète, même si les symptômes les plus forts s'estompent après 2-3 jours." },
      { q: "La mélatonine aide-t-elle contre le jet lag ?", a: "Oui, c'est le complément le plus documenté contre le jet lag. Prenez 0,5 à 3 mg environ 30 minutes avant l'heure de coucher de votre destination, pendant 3-4 jours. Commencez avec une faible dose pour évaluer votre tolérance." },
      { q: "Faut-il dormir dans l'avion pour éviter le jet lag ?", a: "Cela dépend de la direction. En voyage vers l'est, essayez de rester éveillé et de dormir à l'heure locale de destination. Vers l'ouest, dormez quand vous êtes fatigué dans l'avion. L'objectif est de se synchroniser le plus vite possible à l'heure locale." },
      { q: "Comment réduire le jet lag lors d'un long-courrier ?", a: "Réglez votre montre à l'heure de destination dès le décollage, hydratez-vous abondamment (évitez alcool et caféine), exposez-vous à la lumière naturelle à l'arrivée et résistez à la tentation de faire une longue sieste le premier jour." },
    ],
  },
  {
    slug: 'comment-planifier-un-road-trip-reussi-en-voiture',
    label: 'le road trip en voiture',
    faq: [
      { q: "Comment organiser un road trip en voiture ?", a: "Définissez un itinéraire avec des étapes, calculez des distances journalières raisonnables (200-350 km max pour profiter), réservez les hébergements clés à l'avance en haute saison, et vérifiez l'état de votre véhicule avant le départ (pneus, niveaux, courroie)." },
      { q: "Combien de kilomètres par jour est raisonnable en road trip ?", a: "Entre 200 et 350 km par jour est un bon rythme. Au-delà, vous passez plus de temps à conduire qu'à découvrir. Adaptez selon la qualité des routes, les arrêts prévus et la nature du trajet (autoroute vs route de montagne)." },
      { q: "Faut-il tout réserver à l'avance pour un road trip ?", a: "Pas nécessairement. Réservez les premières et dernières nuits ainsi que les hébergements en haute saison dans les zones touristiques. Gardez une flexibilité pour les nuits intermédiaires afin de vous adapter au rythme et aux découvertes imprévues." },
      { q: "Quelle assurance choisir pour un road trip à l'étranger ?", a: "Vérifiez d'abord la couverture de votre carte bancaire premium (Visa Premier, Mastercard Gold) pour l'assistance véhicule et les frais médicaux. Complétez avec une assurance voyage si les plafonds sont insuffisants, surtout pour les road trips hors Europe." },
    ],
  },
  {
    slug: 'comment-trouver-des-billets-d-avion-au-meilleur-prix-conseils-pour-voy',
    label: 'les billets d\'avion',
    faq: [
      { q: "Quand acheter ses billets d'avion pour avoir le meilleur prix ?", a: "Pour les destinations européennes, réservez 4-8 semaines à l'avance. Pour les long-courriers, visez 3-6 mois avant le départ. Les prix augmentent généralement dans les 3 semaines précédant le vol. La flexibilité sur les dates peut faire économiser 30 à 50 %." },
      { q: "Quel jour de la semaine les billets d'avion sont-ils moins chers ?", a: "Les mardis et mercredis sont traditionnellement les jours où les prix sont les plus bas. Évitez de rechercher le vendredi et le week-end, périodes de pic de demande. Voler un mardi ou mercredi est aussi souvent moins cher qu'un vendredi ou dimanche." },
      { q: "Les alertes de prix sur Google Flights sont-elles efficaces ?", a: "Oui, très. Activez une alerte pour votre destination et Google vous notifie dès qu'une baisse significative est détectée. C'est la façon la plus passive et la plus efficace de surveiller les prix sans passer des heures à comparer." },
      { q: "Vaut-il mieux réserver un aller-retour ou deux allers simples ?", a: "Sur les liaisons low-cost européennes, deux allers simples peuvent coûter moins cher. Sur les long-courriers avec des compagnies classiques, l'aller-retour est généralement plus avantageux. Comparez toujours les deux options avant de réserver." },
    ],
  },
  {
    slug: 'eviter-les-pieges-a-touristes-conseils-pour-voyager-comme-un-local',
    label: 'les pièges à touristes',
    faq: [
      { q: "Comment éviter les arnaques en voyage ?", a: "Méfiez-vous des prix non affichés dans les restaurants des zones touristiques, des taxis sans compteur et des 'amis' trop empressés qui proposent leur aide. Renseignez-vous toujours sur les tarifs locaux avant de négocier, et ne sortez pas vos objets de valeur inutilement." },
      { q: "Comment ne pas se faire voler en voyage ?", a: "Utilisez un sac à dos anti-vol ou une pochette ventrale pour vos documents et argent. Ne sortez jamais passeport et cartes bancaires en même temps. Dans les transports en commun bondés, gardez votre sac devant vous et fermez tous les compartiments." },
      { q: "Comment choisir un restaurant fiable à l'étranger ?", a: "Observez la clientèle : un restaurant rempli d'habitants est bon signe. Méfiez-vous des menus en 15 langues, des photos plastifiées et des rabatteurs à l'entrée. Les adresses un peu en retrait des sites touristiques sont souvent meilleures et moins chères." },
      { q: "Comment voyager comme un local ?", a: "Éloignez-vous des zones ultra-touristiques, mangez dans les restaurants fréquentés par les habitants, utilisez les transports en commun locaux plutôt que les taxis touristiques, et apprenez quelques mots de la langue : même un simple 'bonjour' et 'merci' changent l'accueil." },
    ],
  },
  {
    slug: 'gerer-son-budget-voyage-en-groupe-les-meilleures-strategies',
    label: 'le budget voyage en groupe',
    faq: [
      { q: "Comment gérer les dépenses en voyage en groupe ?", a: "Désignez un trésorier ou utilisez une application de partage de dépenses dès le premier jour. Notez chaque dépense commune en temps réel. Faites des bilans réguliers (tous les 2-3 jours) pour éviter les mauvaises surprises en fin de voyage." },
      { q: "Comment diviser équitablement les frais de voyage entre amis ?", a: "La méthode la plus simple est de tout noter et de solder les comptes à la fin du voyage. Des applications comme Odyssa gèrent automatiquement qui doit quoi à qui, en tenant compte des paiements inégaux. Plus la transparence est grande dès le départ, moins il y a de tensions." },
      { q: "Comment voyager moins cher à plusieurs ?", a: "La location d'un appartement ou d'une maison entière est souvent moins chère que plusieurs chambres d'hôtel. Les économies d'échelle jouent aussi sur la voiture de location, les courses au supermarché et les activités à tarif groupe. Plus le groupe est grand, plus les économies sont importantes." },
      { q: "Comment éviter les tensions d'argent en voyage entre amis ?", a: "Définissez un budget commun avant le départ, soyez transparent sur vos contraintes financières et mettez en place un système de suivi dès le premier jour. Clarifier les règles (qui paie quoi, comment on rembourse) avant de partir évite la grande majorité des conflits." },
    ],
  },
  {
    slug: 'l-assurance-voyage-quelles-garanties-pour-un-voyage-serein',
    label: "l'assurance voyage",
    faq: [
      { q: "L'assurance voyage est-elle obligatoire ?", a: "Elle n'est pas légalement obligatoire pour tous les pays, mais elle est indispensable aux États-Unis, au Canada et dans plusieurs pays asiatiques, et vivement recommandée partout. Une hospitalisation à l'étranger peut coûter des dizaines de milliers d'euros sans couverture." },
      { q: "Ma carte bancaire suffit-elle comme assurance voyage ?", a: "Les cartes Visa Premier, Mastercard Gold et cartes haut de gamme incluent une assurance voyage, mais avec des plafonds souvent insuffisants pour les USA ou l'Asie. Vérifiez les conditions précises avant de partir et complétez si nécessaire avec une assurance dédiée." },
      { q: "Quelle est la différence entre assurance annulation et rapatriement ?", a: "L'assurance annulation rembourse votre voyage si vous ne pouvez pas partir (maladie, accident, décès d'un proche). L'assurance rapatriement prend en charge votre retour médical en France si vous tombez malade sur place. Les deux sont complémentaires." },
      { q: "Combien coûte une assurance voyage ?", a: "Comptez environ 3-5 % du coût total du voyage pour une assurance complète. Pour un voyageur fréquent, une assurance annuelle (type Chapka, Iati ou ACS) est souvent plus économique qu'une assurance au voyage. Les prix varient selon la destination et les garanties incluses." },
    ],
  },
  {
    slug: 'la-trousse-a-pharmacie-de-voyage-ideale-conseils-et-checklist',
    label: 'la trousse à pharmacie',
    faq: [
      { q: "Que mettre obligatoirement dans une trousse à pharmacie de voyage ?", a: "Les essentiels : antidouleur/antipyrétique (paracétamol), antihistaminique, antidiarrhéique, désinfectant et pansements, crème solaire haute protection, répulsif anti-moustiques et vos médicaments personnels en quantité suffisante pour toute la durée du voyage plus quelques jours de réserve." },
      { q: "Faut-il emporter des antibiotiques en voyage ?", a: "Sur prescription médicale uniquement. Pour les destinations tropicales ou éloignées, consultez votre médecin 4-6 semaines avant le départ : il peut prescrire une antibiothérapie de secours (traveller's diarrhea kit) ou des antipaludéens adaptés à votre destination." },
      { q: "Comment transporter des médicaments en avion ?", a: "Les médicaments liquides en cabine doivent respecter la règle des 100 ml (dans un sac transparent 1L). Conservez toujours l'ordonnance pour vos médicaments sur prescription, indispensable pour passer les douanes de certains pays. En cas de doute, mettez les médicaments en soute." },
      { q: "Faut-il se faire vacciner avant de voyager ?", a: "Cela dépend entièrement de la destination. Consultez un médecin ou un centre de vaccination internationale au moins 4-6 semaines avant le départ. Hépatite A, typhoïde, fièvre jaune ou méningite sont fréquemment recommandés pour les pays tropicaux ou certaines zones d'Afrique et d'Amérique du Sud." },
    ],
  },
  {
    slug: 'les-meilleures-applications-pour-organiser-un-voyage-en-toute-serenite',
    label: "l'organisation du voyage",
    faq: [
      { q: "Quelle est la meilleure application pour organiser un voyage ?", a: "Odyssa est l'application tout-en-un qui centralise itinéraire, budget partagé, journal de voyage et documents dans une seule app, accessible hors ligne. Idéale pour les voyages seul, en couple ou en groupe, sans jongler entre plusieurs outils." },
      { q: "Comment organiser un voyage sans internet sur place ?", a: "Téléchargez tout en mode hors ligne avant de partir : cartes, itinéraire, documents et réservations. Odyssa est entièrement accessible sans connexion — idéal pour les zones sans réseau, les vols long-courriers ou pour éviter les frais de roaming à l'étranger." },
      { q: "Comment partager un itinéraire de voyage avec ses compagnons ?", a: "Avec Odyssa, invitez vos compagnons de voyage directement dans l'application. Tout le monde peut consulter l'itinéraire, proposer des modifications et voir les dépenses partagées en temps réel, depuis son propre téléphone." },
      { q: "Faut-il imprimer ses documents de voyage ?", a: "Oui, toujours avoir une copie papier de votre passeport, billet d'avion et réservations clés. Mais pour le quotidien, stocker tous vos documents dans une application comme Odyssa permet d'y accéder hors ligne, sans craindre de les perdre." },
    ],
  },
  {
    slug: 'organiser-voyage-entre-amis',
    label: 'le voyage entre amis',
    faq: [
      { q: "Comment s'organiser pour un voyage entre amis ?", a: "Désignez un coordinateur, définissez un budget commun, choisissez les dates ensemble (notez que plus le groupe est grand, plus il faut s'y prendre tôt) et utilisez un outil partagé pour l'itinéraire et les dépenses afin que tout le monde soit au même niveau d'information." },
      { q: "Comment choisir la destination quand on voyage en groupe ?", a: "Faites voter les membres du groupe sur 2-3 options présélectionnées selon vos contraintes communes (budget, durée, saison). Privilégiez les destinations polyvalentes qui ont quelque chose à offrir à chacun pour éviter que certains se sentent frustrés." },
      { q: "Comment éviter les conflits pendant un voyage entre amis ?", a: "Définissez les attentes de chacun avant le départ (rythme, types d'activités, budget par poste), prévoyez des moments de liberté individuelle dans le programme et communiquez ouvertement dès qu'une tension apparaît plutôt que de la laisser s'installer." },
      { q: "Comment gérer les dépenses inégales lors d'un voyage entre amis ?", a: "Utilisez une application de suivi des dépenses partagées dès le premier jour. Notez chaque dépense commune au moment où elle se produit, qu'il s'agisse d'une tournée de glaces ou d'une nuit d'hôtel. Soldez les comptes régulièrement pour éviter des sommes trop importantes à rembourser d'un coup." },
    ],
  },
  {
    slug: 'voyage-pas-cher-10-secrets-pour-explorer-le-monde-sans-ruiner-votre-bu',
    label: 'le voyage pas cher',
    faq: [
      { q: "Comment voyager pas cher ?", a: "Soyez flexible sur les dates (évitez les vacances scolaires et les week-ends), réservez vos billets à l'avance, logez en auberge de jeunesse ou chez l'habitant, mangez dans les marchés et restaurants locaux et optez pour les transports en commun plutôt que les taxis." },
      { q: "Quelle est la destination la moins chère pour voyager en Europe ?", a: "Les pays d'Europe de l'Est sont nettement plus abordables que l'Ouest. Budapest, Prague, Cracovie, Bucarest ou Sofia offrent une richesse culturelle exceptionnelle avec un budget deux à trois fois moins élevé qu'à Paris, Rome ou Amsterdam." },
      { q: "Comment trouver des vols pas chers de dernière minute ?", a: "Les vols de dernière minute sont souvent chers contrairement à la croyance populaire. Pour de vrais bons prix, utilisez Google Flights avec le calendrier de prix, activez les alertes et soyez flexible sur les aéroports de départ et d'arrivée." },
      { q: "Peut-on voyager seul pas cher ?", a: "Tout à fait, et le voyage solo facilite même les économies : flexibilité maximale pour choisir les dates et destinations les moins chères, possibilité de loger en dortoir d'auberge de jeunesse, et aucune dépense contrainte par les préférences d'un groupe." },
    ],
  },
  {
    slug: 'voyager-en-toute-securite-avec-votre-bebe-conseils-et-astuces',
    label: 'le voyage avec bébé',
    faq: [
      { q: "À quel âge peut-on voyager en avion avec un bébé ?", a: "La plupart des compagnies aériennes acceptent les bébés à partir de 7 jours avec un certificat médical. Médicalement, il est conseillé d'attendre au moins 2-3 mois pour laisser le temps au système immunitaire de se développer. Consultez votre pédiatre avant tout voyage long." },
      { q: "Comment gérer le décalage horaire avec un bébé ?", a: "Commencez à décaler progressivement les horaires de repas et de sommeil 3-4 jours avant le départ. Sur place, exposez bébé à la lumière naturelle le matin et maintenez ses rituels habituels. Les bébés s'adaptent souvent plus vite qu'on ne le pense." },
      { q: "Que mettre dans le sac pour prendre l'avion avec un bébé ?", a: "Prévoyez le double de couches nécessaires (les retards arrivent), des lingettes en grande quantité, des vêtements de rechange pour bébé et pour vous, une tétine de rechange, une couverture, sa nourriture habituelle et un jouet familier pour le rassurer." },
      { q: "Quelles vaccinations sont nécessaires pour voyager avec un bébé ?", a: "Cela dépend de la destination et de l'âge de l'enfant. Consultez votre pédiatre et un médecin voyagiste au moins 6-8 semaines avant le départ. Certaines destinations tropicales nécessitent des protections spécifiques (antipaludéens, vaccins) adaptées à l'âge du bébé." },
    ],
  },
  {
    slug: 'voyager-en-train-en-europe-avec-interrail-les-conseils-pratiques',
    label: "l'Interrail",
    faq: [
      { q: "Qu'est-ce que l'Interrail et à qui s'adresse-t-il ?", a: "L'Interrail est un pass ferroviaire qui donne accès aux trains dans 33 pays européens pendant une période définie. Il s'adresse aux résidents européens de tous les âges, bien qu'il soit particulièrement populaire chez les moins de 28 ans qui bénéficient de tarifs réduits." },
      { q: "L'Interrail permet-il de voyager gratuitement en train ?", a: "Pas complètement. Le pass couvre le voyage en train, mais des frais de réservation obligatoires s'appliquent sur les trains à grande vitesse (Eurostar, Thalys, TGV, AVE, Frecciarossa...). Ces frais varient de 5 à 30 € par trajet selon le train et la compagnie." },
      { q: "Combien coûte un pass Interrail ?", a: "Un pass 7 jours en 1 mois coûte environ 250-350 € en 2e classe pour un adulte. Les moins de 28 ans bénéficient d'environ 25 % de réduction. Le rapport qualité-prix est optimal pour les voyages couvrant 4 pays ou plus avec des trajets en train rapides." },
      { q: "Quels pays peut-on visiter avec l'Interrail ?", a: "33 pays sont couverts dont la France, l'Espagne, l'Italie, l'Allemagne, la Suisse, l'Autriche, la Suède, la Grèce et les pays des Balkans. Le Royaume-Uni nécessite un pass Eurail séparé depuis le Brexit. La Russie et la Turquie ne sont pas incluses." },
    ],
  },
  {
    slug: 'voyager-seul-pour-la-premiere-fois-conseils-et-astuces-pour-un-voyage-',
    label: 'le voyage solo',
    faq: [
      { q: "Est-il dangereux de voyager seul pour la première fois ?", a: "Le voyage en solo est très sûr si vous prenez les précautions habituelles : renseignez-vous sur la situation sécuritaire de votre destination, partagez votre itinéraire avec un proche, évitez les zones isolées la nuit et faites confiance à votre intuition." },
      { q: "Quelle destination choisir pour un premier voyage en solo ?", a: "Les destinations anglophones ou très touristiques sont idéales pour débuter : Portugal, Islande, Thaïlande, Bali ou les grandes capitales européennes. L'infrastructure touristique bien développée facilite les déplacements, les rencontres et la résolution des imprévus." },
      { q: "Comment faire des rencontres quand on voyage seul ?", a: "Logez en auberge de jeunesse pour rencontrer naturellement d'autres voyageurs, participez aux free walking tours organisés dans la plupart des villes, rejoignez des activités de groupe (cours de cuisine, randonnées guidées) ou installez-vous dans un café avec un livre ouvert." },
      { q: "Quel est le plus grand avantage du voyage solo ?", a: "La liberté totale. Aucun compromis sur l'itinéraire, le rythme, les horaires ou le budget. Vous pouvez changer de plan à la dernière minute, rester plus longtemps là où vous vous sentez bien, partir quand bon vous semble et manger exactement où vous en avez envie." },
    ],
  },
  {
    slug: 'bagages-cabine-comment-tout-faire-tenir-dans-votre-valise',
    label: 'les bagages cabine',
    faq: [
      { q: "Quelles sont les dimensions autorisées pour un bagage cabine ?", a: "Les dimensions standard acceptées par la majorité des compagnies sont 55x40x20 cm pour un poids de 10 kg. Attention : les low-cost comme Ryanair ou Vueling ont des règles plus strictes et facturent les bagages supplémentaires. Vérifiez toujours avant de partir." },
      { q: "Comment faire tenir une semaine de vêtements dans un bagage cabine ?", a: "Optez pour des vêtements légers et polyvalents en couleurs neutres qui se mixent facilement, roulez vos vêtements au lieu de les plier (gain de place et moins de froissage), utilisez des cubes de rangement compressibles et limitez-vous à deux paires de chaussures maximum." },
      { q: "Quels liquides peut-on mettre en bagage cabine ?", a: "Les liquides en cabine sont limités à des contenants de 100 ml maximum, tous regroupés dans un sac transparent 1 litre (une limite par passager). Les produits achetés en duty-free après le contrôle de sécurité sont exemptés de cette règle." },
      { q: "Vaut-il mieux voyager avec un bagage cabine seulement ?", a: "Oui, pour les séjours jusqu'à une semaine. Voyager sans bagage en soute vous fait gagner du temps (pas d'attente au carrousel à l'atterrissage), économiser de l'argent (frais de soute souvent 30-60 €) et élimine le risque de perte de bagage." },
    ],
  },
  {
    slug: 'checklist-voyage-famille',
    label: 'le voyage en famille',
    faq: [
      { q: "Comment préparer un voyage en famille avec des enfants ?", a: "Commencez à planifier 3-6 mois à l'avance pour trouver les meilleures offres. Choisissez un hébergement avec cuisine pour réduire les coûts et faciliter les repas des enfants. Impliquez les enfants dans les choix (activités, restaurant) pour qu'ils soient enthousiastes dès le départ." },
      { q: "Quels documents faut-il pour voyager à l'étranger avec ses enfants ?", a: "Chaque enfant doit avoir son propre passeport ou carte d'identité valide. En France, si l'enfant voyage avec un seul parent, une attestation de sortie du territoire signée par l'autre parent est obligatoire depuis 2017, accompagnée d'une copie de la pièce d'identité du parent absent." },
      { q: "Comment occuper les enfants pendant un long vol ?", a: "Préparez une trousse de survie : tablette avec contenus téléchargés hors ligne, livres et jeux de voyage adaptés à l'âge, snacks favoris et quelques petites surprises emballées à déballer en cours de vol. Si possible, choisissez des vols de nuit pour les plus jeunes." },
      { q: "Quelle assurance voyage choisir pour un voyage en famille ?", a: "Optez pour une assurance famille qui couvre tous les membres en un seul contrat, généralement bien moins chère que plusieurs contrats individuels. Vérifiez qu'elle inclut les frais médicaux enfants, le rapatriement et l'annulation. Certaines cartes bancaires premium couvrent toute la famille résidant à la même adresse." },
    ],
  },
];

// ─── RUN ──────────────────────────────────────────────────────────────────────

async function run() {
  for (const d of destinations) {
    const path = join(ROOT, 'blog/destinations', d.slug, 'index.html');
    await inject(path, d.faq, d.label);
  }
  for (const t of tips) {
    const path = join(ROOT, 'blog', t.slug, 'index.html');
    await inject(path, t.faq, t.label);
  }
  console.log('\nMigration terminée.');
}

run().catch(console.error);
