import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// POKÉMON DATABASE - Static fallback (loads instantly, works offline)
// New Pokémon beyond #1025 are auto-synced from PokeAPI on startup
// ============================================================================
const STATIC_MAX_ID = 1025;

const GENERATION_DEFS = {
  10: { name: "Generation X", region: "Unknown", label: "New Discovery", color: "#00CFC1", icon: "🌟" },
  11: { name: "Generation XI", region: "Unknown", label: "Frontier", color: "#FF4F8B", icon: "✨" },
};

const GENERATIONS_STATIC = {
  1: { name: "Generation I", region: "Kanto", label: "Base Set", color: "#E63946", range: [1, 151], icon: "🔴" },
  2: { name: "Generation II", region: "Johto", label: "Jungle", color: "#FFB703", range: [152, 251], icon: "🟡" },
  3: { name: "Generation III", region: "Hoenn", label: "Fossil", color: "#2A9D8F", range: [252, 386], icon: "🟢" },
  4: { name: "Generation IV", region: "Sinnoh", label: "Rocket", color: "#457B9D", range: [387, 493], icon: "🔵" },
  5: { name: "Generation V", region: "Unova", label: "Gym Heroes", color: "#6D6875", range: [494, 649], icon: "⚫" },
  6: { name: "Generation VI", region: "Kalos", label: "Neo Genesis", color: "#E07A5F", range: [650, 721], icon: "🟠" },
  7: { name: "Generation VII", region: "Alola", label: "Aquapolis", color: "#81B29A", range: [722, 809], icon: "🌴" },
  8: { name: "Generation VIII", region: "Galar", label: "Skyridge", color: "#9B5DE5", range: [810, 905], icon: "🟣" },
  9: { name: "Generation IX", region: "Paldea", label: "Scarlet & Violet", color: "#F72585", range: [906, 1025], icon: "💎" },
};

// ============================================================================
// POKEAPI SYNC - Fetches new Pokémon beyond the static database
// ============================================================================
const GEN_RANGES = [
  [1, 151, 1], [152, 251, 2], [252, 386, 3], [387, 493, 4],
  [494, 649, 5], [650, 721, 6], [722, 809, 7], [810, 905, 8], [906, 1025, 9],
];

function getGenForId(id) {
  for (const [start, end, gen] of GEN_RANGES) {
    if (id >= start && id <= end) return gen;
  }
  return 10; // Future gen
}

function makePokemonObj(id, name, type1, type2, gen) {
  return {
    id, name, type1, type2: type2 || null, gen,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
    spriteSmall: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
  };
}

async function syncNewPokemon(onProgress) {
  try {
    // Step 1: Check total count from PokeAPI
    const countRes = await fetch("https://pokeapi.co/api/v2/pokemon-species/?limit=1");
    if (!countRes.ok) return { newPokemon: [], newGens: {} };
    const countData = await countRes.json();
    const totalCount = countData.count;

    if (totalCount <= STATIC_MAX_ID) {
      return { newPokemon: [], newGens: {} };
    }

    // Step 2: Fetch all species beyond our static data
    const newCount = totalCount - STATIC_MAX_ID;
    onProgress?.(`Found ${newCount} new Pokémon...`);

    const listRes = await fetch(
      `https://pokeapi.co/api/v2/pokemon-species/?offset=${STATIC_MAX_ID}&limit=${newCount}`
    );
    if (!listRes.ok) return { newPokemon: [], newGens: {} };
    const listData = await listRes.json();

    // Step 3: Fetch details for each new Pokémon (in batches of 10)
    const newPokemon = [];
    const species = listData.results;
    const batchSize = 10;

    for (let i = 0; i < species.length; i += batchSize) {
      const batch = species.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (s) => {
          // Extract ID from URL
          const urlParts = s.url.replace(/\/$/, "").split("/");
          const speciesId = parseInt(urlParts[urlParts.length - 1]);

          // Fetch pokemon data for types
          const pokRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${speciesId}`);
          if (!pokRes.ok) return null;
          const pokData = await pokRes.json();

          const types = pokData.types.sort((a, b) => a.slot - b.slot);
          const type1 = types[0]?.type?.name || "normal";
          const type2 = types[1]?.type?.name || null;

          // Get generation from species
          const specRes = await fetch(s.url);
          if (!specRes.ok) return null;
          const specData = await specRes.json();
          const genUrl = specData.generation?.url || "";
          const genMatch = genUrl.match(/generation\/(\d+)/);
          const gen = genMatch ? parseInt(genMatch[1]) : getGenForId(speciesId);

          // Capitalize name
          const name = pokData.name.split("-").map(w =>
            w.charAt(0).toUpperCase() + w.slice(1)
          ).join("-");

          return makePokemonObj(speciesId, name, type1, type2, gen);
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          newPokemon.push(r.value);
        }
      }

      onProgress?.(`Syncing... ${Math.min(i + batchSize, species.length)}/${species.length}`);
    }

    // Step 4: Figure out if we have new generations
    const newGens = {};
    for (const p of newPokemon) {
      if (!GENERATIONS_STATIC[p.gen]) {
        if (!newGens[p.gen]) {
          const genPokemon = newPokemon.filter(np => np.gen === p.gen);
          const minId = Math.min(...genPokemon.map(np => np.id));
          const maxId = Math.max(...genPokemon.map(np => np.id));
          const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
          const numeral = romanNumerals[p.gen] || p.gen.toString();
          newGens[p.gen] = {
            name: `Generation ${numeral}`,
            region: "New Region",
            label: `Gen ${numeral}`,
            color: GENERATION_DEFS[p.gen]?.color || "#00CFC1",
            range: [minId, maxId],
            icon: GENERATION_DEFS[p.gen]?.icon || "🌟",
          };
        }
      }
    }

    return { newPokemon, newGens };
  } catch (err) {
    console.warn("PokeAPI sync failed (offline mode):", err);
    return { newPokemon: [], newGens: {} };
  }
}

const TYPE_COLORS = {
  normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030",
  grass: "#78C850", ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0",
  ground: "#E0C068", flying: "#A890F0", psychic: "#F85888", bug: "#A8B820",
  rock: "#B8A038", ghost: "#705898", dragon: "#7038F8", dark: "#705848",
  steel: "#B8B8D0", fairy: "#EE99AC",
};

// Comprehensive pokemon data (id, name, type1, type2, gen)
const POKEMON_DATA = [
  [1,"Bulbasaur","grass","poison",1],[2,"Ivysaur","grass","poison",1],[3,"Venusaur","grass","poison",1],[4,"Charmander","fire",null,1],[5,"Charmeleon","fire",null,1],[6,"Charizard","fire","flying",1],[7,"Squirtle","water",null,1],[8,"Wartortle","water",null,1],[9,"Blastoise","water",null,1],[10,"Caterpie","bug",null,1],[11,"Metapod","bug",null,1],[12,"Butterfree","bug","flying",1],[13,"Weedle","bug","poison",1],[14,"Kakuna","bug","poison",1],[15,"Beedrill","bug","poison",1],[16,"Pidgey","normal","flying",1],[17,"Pidgeotto","normal","flying",1],[18,"Pidgeot","normal","flying",1],[19,"Rattata","normal",null,1],[20,"Raticate","normal",null,1],[21,"Spearow","normal","flying",1],[22,"Fearow","normal","flying",1],[23,"Ekans","poison",null,1],[24,"Arbok","poison",null,1],[25,"Pikachu","electric",null,1],[26,"Raichu","electric",null,1],[27,"Sandshrew","ground",null,1],[28,"Sandslash","ground",null,1],[29,"Nidoran♀","poison",null,1],[30,"Nidorina","poison",null,1],[31,"Nidoqueen","poison","ground",1],[32,"Nidoran♂","poison",null,1],[33,"Nidorino","poison",null,1],[34,"Nidoking","poison","ground",1],[35,"Clefairy","fairy",null,1],[36,"Clefable","fairy",null,1],[37,"Vulpix","fire",null,1],[38,"Ninetales","fire",null,1],[39,"Jigglypuff","normal","fairy",1],[40,"Wigglytuff","normal","fairy",1],[41,"Zubat","poison","flying",1],[42,"Golbat","poison","flying",1],[43,"Oddish","grass","poison",1],[44,"Gloom","grass","poison",1],[45,"Vileplume","grass","poison",1],[46,"Paras","bug","grass",1],[47,"Parasect","bug","grass",1],[48,"Venonat","bug","poison",1],[49,"Venomoth","bug","poison",1],[50,"Diglett","ground",null,1],[51,"Dugtrio","ground",null,1],[52,"Meowth","normal",null,1],[53,"Persian","normal",null,1],[54,"Psyduck","water",null,1],[55,"Golduck","water",null,1],[56,"Mankey","fighting",null,1],[57,"Primeape","fighting",null,1],[58,"Growlithe","fire",null,1],[59,"Arcanine","fire",null,1],[60,"Poliwag","water",null,1],[61,"Poliwhirl","water",null,1],[62,"Poliwrath","water","fighting",1],[63,"Abra","psychic",null,1],[64,"Kadabra","psychic",null,1],[65,"Alakazam","psychic",null,1],[66,"Machop","fighting",null,1],[67,"Machoke","fighting",null,1],[68,"Machamp","fighting",null,1],[69,"Bellsprout","grass","poison",1],[70,"Weepinbell","grass","poison",1],[71,"Victreebel","grass","poison",1],[72,"Tentacool","water","poison",1],[73,"Tentacruel","water","poison",1],[74,"Geodude","rock","ground",1],[75,"Graveler","rock","ground",1],[76,"Golem","rock","ground",1],[77,"Ponyta","fire",null,1],[78,"Rapidash","fire",null,1],[79,"Slowpoke","water","psychic",1],[80,"Slowbro","water","psychic",1],[81,"Magnemite","electric","steel",1],[82,"Magneton","electric","steel",1],[83,"Farfetch'd","normal","flying",1],[84,"Doduo","normal","flying",1],[85,"Dodrio","normal","flying",1],[86,"Seel","water",null,1],[87,"Dewgong","water","ice",1],[88,"Grimer","poison",null,1],[89,"Muk","poison",null,1],[90,"Shellder","water",null,1],[91,"Cloyster","water","ice",1],[92,"Gastly","ghost","poison",1],[93,"Haunter","ghost","poison",1],[94,"Gengar","ghost","poison",1],[95,"Onix","rock","ground",1],[96,"Drowzee","psychic",null,1],[97,"Hypno","psychic",null,1],[98,"Krabby","water",null,1],[99,"Kingler","water",null,1],[100,"Voltorb","electric",null,1],[101,"Electrode","electric",null,1],[102,"Exeggcute","grass","psychic",1],[103,"Exeggutor","grass","psychic",1],[104,"Cubone","ground",null,1],[105,"Marowak","ground",null,1],[106,"Hitmonlee","fighting",null,1],[107,"Hitmonchan","fighting",null,1],[108,"Lickitung","normal",null,1],[109,"Koffing","poison",null,1],[110,"Weezing","poison",null,1],[111,"Rhyhorn","ground","rock",1],[112,"Rhydon","ground","rock",1],[113,"Chansey","normal",null,1],[114,"Tangela","grass",null,1],[115,"Kangaskhan","normal",null,1],[116,"Horsea","water",null,1],[117,"Seadra","water",null,1],[118,"Goldeen","water",null,1],[119,"Seaking","water",null,1],[120,"Staryu","water",null,1],[121,"Starmie","water","psychic",1],[122,"Mr. Mime","psychic","fairy",1],[123,"Scyther","bug","flying",1],[124,"Jynx","ice","psychic",1],[125,"Electabuzz","electric",null,1],[126,"Magmar","fire",null,1],[127,"Pinsir","bug",null,1],[128,"Tauros","normal",null,1],[129,"Magikarp","water",null,1],[130,"Gyarados","water","flying",1],[131,"Lapras","water","ice",1],[132,"Ditto","normal",null,1],[133,"Eevee","normal",null,1],[134,"Vaporeon","water",null,1],[135,"Jolteon","electric",null,1],[136,"Flareon","fire",null,1],[137,"Porygon","normal",null,1],[138,"Omanyte","rock","water",1],[139,"Omastar","rock","water",1],[140,"Kabuto","rock","water",1],[141,"Kabutops","rock","water",1],[142,"Aerodactyl","rock","flying",1],[143,"Snorlax","normal",null,1],[144,"Articuno","ice","flying",1],[145,"Zapdos","electric","flying",1],[146,"Moltres","fire","flying",1],[147,"Dratini","dragon",null,1],[148,"Dragonair","dragon",null,1],[149,"Dragonite","dragon","flying",1],[150,"Mewtwo","psychic",null,1],[151,"Mew","psychic",null,1],
  [152,"Chikorita","grass",null,2],[153,"Bayleef","grass",null,2],[154,"Meganium","grass",null,2],[155,"Cyndaquil","fire",null,2],[156,"Quilava","fire",null,2],[157,"Typhlosion","fire",null,2],[158,"Totodile","water",null,2],[159,"Croconaw","water",null,2],[160,"Feraligatr","water",null,2],[161,"Sentret","normal",null,2],[162,"Furret","normal",null,2],[163,"Hoothoot","normal","flying",2],[164,"Noctowl","normal","flying",2],[165,"Ledyba","bug","flying",2],[166,"Ledian","bug","flying",2],[167,"Spinarak","bug","poison",2],[168,"Ariados","bug","poison",2],[169,"Crobat","poison","flying",2],[170,"Chinchou","water","electric",2],[171,"Lanturn","water","electric",2],[172,"Pichu","electric",null,2],[173,"Cleffa","fairy",null,2],[174,"Igglybuff","normal","fairy",2],[175,"Togepi","fairy",null,2],[176,"Togetic","fairy","flying",2],[177,"Natu","psychic","flying",2],[178,"Xatu","psychic","flying",2],[179,"Mareep","electric",null,2],[180,"Flaaffy","electric",null,2],[181,"Ampharos","electric",null,2],[182,"Bellossom","grass",null,2],[183,"Marill","water","fairy",2],[184,"Azumarill","water","fairy",2],[185,"Sudowoodo","rock",null,2],[186,"Politoed","water",null,2],[187,"Hoppip","grass","flying",2],[188,"Skiploom","grass","flying",2],[189,"Jumpluff","grass","flying",2],[190,"Aipom","normal",null,2],[191,"Sunkern","grass",null,2],[192,"Sunflora","grass",null,2],[193,"Yanma","bug","flying",2],[194,"Wooper","water","ground",2],[195,"Quagsire","water","ground",2],[196,"Espeon","psychic",null,2],[197,"Umbreon","dark",null,2],[198,"Murkrow","dark","flying",2],[199,"Slowking","water","psychic",2],[200,"Misdreavus","ghost",null,2],[201,"Unown","psychic",null,2],[202,"Wobbuffet","psychic",null,2],[203,"Girafarig","normal","psychic",2],[204,"Pineco","bug",null,2],[205,"Forretress","bug","steel",2],[206,"Dunsparce","normal",null,2],[207,"Gligar","ground","flying",2],[208,"Steelix","steel","ground",2],[209,"Snubbull","fairy",null,2],[210,"Granbull","fairy",null,2],[211,"Qwilfish","water","poison",2],[212,"Scizor","bug","steel",2],[213,"Shuckle","bug","rock",2],[214,"Heracross","bug","fighting",2],[215,"Sneasel","dark","ice",2],[216,"Teddiursa","normal",null,2],[217,"Ursaring","normal",null,2],[218,"Slugma","fire",null,2],[219,"Magcargo","fire","rock",2],[220,"Swinub","ice","ground",2],[221,"Piloswine","ice","ground",2],[222,"Corsola","water","rock",2],[223,"Remoraid","water",null,2],[224,"Octillery","water",null,2],[225,"Delibird","ice","flying",2],[226,"Mantine","water","flying",2],[227,"Skarmory","steel","flying",2],[228,"Houndour","dark","fire",2],[229,"Houndoom","dark","fire",2],[230,"Kingdra","water","dragon",2],[231,"Phanpy","ground",null,2],[232,"Donphan","ground",null,2],[233,"Porygon2","normal",null,2],[234,"Stantler","normal",null,2],[235,"Smeargle","normal",null,2],[236,"Tyrogue","fighting",null,2],[237,"Hitmontop","fighting",null,2],[238,"Smoochum","ice","psychic",2],[239,"Elekid","electric",null,2],[240,"Magby","fire",null,2],[241,"Miltank","normal",null,2],[242,"Blissey","normal",null,2],[243,"Raikou","electric",null,2],[244,"Entei","fire",null,2],[245,"Suicune","water",null,2],[246,"Larvitar","rock","ground",2],[247,"Pupitar","rock","ground",2],[248,"Tyranitar","rock","dark",2],[249,"Lugia","psychic","flying",2],[250,"Ho-Oh","fire","flying",2],[251,"Celebi","psychic","grass",2],
  [252,"Treecko","grass",null,3],[253,"Grovyle","grass",null,3],[254,"Sceptile","grass",null,3],[255,"Torchic","fire",null,3],[256,"Combusken","fire","fighting",3],[257,"Blaziken","fire","fighting",3],[258,"Mudkip","water",null,3],[259,"Marshtomp","water","ground",3],[260,"Swampert","water","ground",3],[261,"Poochyena","dark",null,3],[262,"Mightyena","dark",null,3],[263,"Zigzagoon","normal",null,3],[264,"Linoone","normal",null,3],[265,"Wurmple","bug",null,3],[266,"Silcoon","bug",null,3],[267,"Beautifly","bug","flying",3],[268,"Cascoon","bug",null,3],[269,"Dustox","bug","poison",3],[270,"Lotad","water","grass",3],[271,"Lombre","water","grass",3],[272,"Ludicolo","water","grass",3],[273,"Seedot","grass",null,3],[274,"Nuzleaf","grass","dark",3],[275,"Shiftry","grass","dark",3],[276,"Taillow","normal","flying",3],[277,"Swellow","normal","flying",3],[278,"Wingull","water","flying",3],[279,"Pelipper","water","flying",3],[280,"Ralts","psychic","fairy",3],[281,"Kirlia","psychic","fairy",3],[282,"Gardevoir","psychic","fairy",3],[283,"Surskit","bug","water",3],[284,"Masquerain","bug","flying",3],[285,"Shroomish","grass",null,3],[286,"Breloom","grass","fighting",3],[287,"Slakoth","normal",null,3],[288,"Vigoroth","normal",null,3],[289,"Slaking","normal",null,3],[290,"Nincada","bug","ground",3],[291,"Ninjask","bug","flying",3],[292,"Shedinja","bug","ghost",3],[293,"Whismur","normal",null,3],[294,"Loudred","normal",null,3],[295,"Exploud","normal",null,3],[296,"Makuhita","fighting",null,3],[297,"Hariyama","fighting",null,3],[298,"Azurill","normal","fairy",3],[299,"Nosepass","rock",null,3],[300,"Skitty","normal",null,3],[301,"Delcatty","normal",null,3],[302,"Sableye","dark","ghost",3],[303,"Mawile","steel","fairy",3],[304,"Aron","steel","rock",3],[305,"Lairon","steel","rock",3],[306,"Aggron","steel","rock",3],[307,"Meditite","fighting","psychic",3],[308,"Medicham","fighting","psychic",3],[309,"Electrike","electric",null,3],[310,"Manectric","electric",null,3],[311,"Plusle","electric",null,3],[312,"Minun","electric",null,3],[313,"Volbeat","bug",null,3],[314,"Illumise","bug",null,3],[315,"Roselia","grass","poison",3],[316,"Gulpin","poison",null,3],[317,"Swalot","poison",null,3],[318,"Carvanha","water","dark",3],[319,"Sharpedo","water","dark",3],[320,"Wailmer","water",null,3],[321,"Wailord","water",null,3],[322,"Numel","fire","ground",3],[323,"Camerupt","fire","ground",3],[324,"Torkoal","fire",null,3],[325,"Spoink","psychic",null,3],[326,"Grumpig","psychic",null,3],[327,"Spinda","normal",null,3],[328,"Trapinch","ground",null,3],[329,"Vibrava","ground","dragon",3],[330,"Flygon","ground","dragon",3],[331,"Cacnea","grass",null,3],[332,"Cacturne","grass","dark",3],[333,"Swablu","normal","flying",3],[334,"Altaria","dragon","flying",3],[335,"Zangoose","normal",null,3],[336,"Seviper","poison",null,3],[337,"Lunatone","rock","psychic",3],[338,"Solrock","rock","psychic",3],[339,"Barboach","water","ground",3],[340,"Whiscash","water","ground",3],[341,"Corphish","water",null,3],[342,"Crawdaunt","water","dark",3],[343,"Baltoy","ground","psychic",3],[344,"Claydol","ground","psychic",3],[345,"Lileep","rock","grass",3],[346,"Cradily","rock","grass",3],[347,"Anorith","rock","bug",3],[348,"Armaldo","rock","bug",3],[349,"Feebas","water",null,3],[350,"Milotic","water",null,3],[351,"Castform","normal",null,3],[352,"Kecleon","normal",null,3],[353,"Shuppet","ghost",null,3],[354,"Banette","ghost",null,3],[355,"Duskull","ghost",null,3],[356,"Dusclops","ghost",null,3],[357,"Tropius","grass","flying",3],[358,"Chimecho","psychic",null,3],[359,"Absol","dark",null,3],[360,"Wynaut","psychic",null,3],[361,"Snorunt","ice",null,3],[362,"Glalie","ice",null,3],[363,"Spheal","ice","water",3],[364,"Sealeo","ice","water",3],[365,"Walrein","ice","water",3],[366,"Clamperl","water",null,3],[367,"Huntail","water",null,3],[368,"Gorebyss","water",null,3],[369,"Relicanth","water","rock",3],[370,"Luvdisc","water",null,3],[371,"Bagon","dragon",null,3],[372,"Shelgon","dragon",null,3],[373,"Salamence","dragon","flying",3],[374,"Beldum","steel","psychic",3],[375,"Metang","steel","psychic",3],[376,"Metagross","steel","psychic",3],[377,"Regirock","rock",null,3],[378,"Regice","ice",null,3],[379,"Registeel","steel",null,3],[380,"Latias","dragon","psychic",3],[381,"Latios","dragon","psychic",3],[382,"Kyogre","water",null,3],[383,"Groudon","ground",null,3],[384,"Rayquaza","dragon","flying",3],[385,"Jirachi","steel","psychic",3],[386,"Deoxys","psychic",null,3],
  [387,"Turtwig","grass",null,4],[388,"Grotle","grass",null,4],[389,"Torterra","grass","ground",4],[390,"Chimchar","fire",null,4],[391,"Monferno","fire","fighting",4],[392,"Infernape","fire","fighting",4],[393,"Piplup","water",null,4],[394,"Prinplup","water",null,4],[395,"Empoleon","water","steel",4],[396,"Starly","normal","flying",4],[397,"Staravia","normal","flying",4],[398,"Staraptor","normal","flying",4],[399,"Bidoof","normal",null,4],[400,"Bibarel","normal","water",4],[401,"Kricketot","bug",null,4],[402,"Kricketune","bug",null,4],[403,"Shinx","electric",null,4],[404,"Luxio","electric",null,4],[405,"Luxray","electric",null,4],[406,"Budew","grass","poison",4],[407,"Roserade","grass","poison",4],[408,"Cranidos","rock",null,4],[409,"Rampardos","rock",null,4],[410,"Shieldon","rock","steel",4],[411,"Bastiodon","rock","steel",4],[412,"Burmy","bug",null,4],[413,"Wormadam","bug","grass",4],[414,"Mothim","bug","flying",4],[415,"Combee","bug","flying",4],[416,"Vespiquen","bug","flying",4],[417,"Pachirisu","electric",null,4],[418,"Buizel","water",null,4],[419,"Floatzel","water",null,4],[420,"Cherubi","grass",null,4],[421,"Cherrim","grass",null,4],[422,"Shellos","water",null,4],[423,"Gastrodon","water","ground",4],[424,"Ambipom","normal",null,4],[425,"Drifloon","ghost","flying",4],[426,"Drifblim","ghost","flying",4],[427,"Buneary","normal",null,4],[428,"Lopunny","normal",null,4],[429,"Mismagius","ghost",null,4],[430,"Honchkrow","dark","flying",4],[431,"Glameow","normal",null,4],[432,"Purugly","normal",null,4],[433,"Chingling","psychic",null,4],[434,"Stunky","poison","dark",4],[435,"Skuntank","poison","dark",4],[436,"Bronzor","steel","psychic",4],[437,"Bronzong","steel","psychic",4],[438,"Bonsly","rock",null,4],[439,"Mime Jr.","psychic","fairy",4],[440,"Happiny","normal",null,4],[441,"Chatot","normal","flying",4],[442,"Spiritomb","ghost","dark",4],[443,"Gible","dragon","ground",4],[444,"Gabite","dragon","ground",4],[445,"Garchomp","dragon","ground",4],[446,"Munchlax","normal",null,4],[447,"Riolu","fighting",null,4],[448,"Lucario","fighting","steel",4],[449,"Hippopotas","ground",null,4],[450,"Hippowdon","ground",null,4],[451,"Skorupi","poison","bug",4],[452,"Drapion","poison","dark",4],[453,"Croagunk","poison","fighting",4],[454,"Toxicroak","poison","fighting",4],[455,"Carnivine","grass",null,4],[456,"Finneon","water",null,4],[457,"Lumineon","water",null,4],[458,"Mantyke","water","flying",4],[459,"Snover","grass","ice",4],[460,"Abomasnow","grass","ice",4],[461,"Weavile","dark","ice",4],[462,"Magnezone","electric","steel",4],[463,"Lickilicky","normal",null,4],[464,"Rhyperior","ground","rock",4],[465,"Tangrowth","grass",null,4],[466,"Electivire","electric",null,4],[467,"Magmortar","fire",null,4],[468,"Togekiss","fairy","flying",4],[469,"Yanmega","bug","flying",4],[470,"Leafeon","grass",null,4],[471,"Glaceon","ice",null,4],[472,"Gliscor","ground","flying",4],[473,"Mamoswine","ice","ground",4],[474,"Porygon-Z","normal",null,4],[475,"Gallade","psychic","fighting",4],[476,"Probopass","rock","steel",4],[477,"Dusknoir","ghost",null,4],[478,"Froslass","ice","ghost",4],[479,"Rotom","electric","ghost",4],[480,"Uxie","psychic",null,4],[481,"Mesprit","psychic",null,4],[482,"Azelf","psychic",null,4],[483,"Dialga","steel","dragon",4],[484,"Palkia","water","dragon",4],[485,"Heatran","fire","steel",4],[486,"Regigigas","normal",null,4],[487,"Giratina","ghost","dragon",4],[488,"Cresselia","psychic",null,4],[489,"Phione","water",null,4],[490,"Manaphy","water",null,4],[491,"Darkrai","dark",null,4],[492,"Shaymin","grass",null,4],[493,"Arceus","normal",null,4],
  [494,"Victini","psychic","fire",5],[495,"Snivy","grass",null,5],[496,"Servine","grass",null,5],[497,"Serperior","grass",null,5],[498,"Tepig","fire",null,5],[499,"Pignite","fire","fighting",5],[500,"Emboar","fire","fighting",5],[501,"Oshawott","water",null,5],[502,"Dewott","water",null,5],[503,"Samurott","water",null,5],[504,"Patrat","normal",null,5],[505,"Watchog","normal",null,5],[506,"Lillipup","normal",null,5],[507,"Herdier","normal",null,5],[508,"Stoutland","normal",null,5],[509,"Purrloin","dark",null,5],[510,"Liepard","dark",null,5],[511,"Pansage","grass",null,5],[512,"Simisage","grass",null,5],[513,"Pansear","fire",null,5],[514,"Simisear","fire",null,5],[515,"Panpour","water",null,5],[516,"Simipour","water",null,5],[517,"Munna","psychic",null,5],[518,"Musharna","psychic",null,5],[519,"Pidove","normal","flying",5],[520,"Tranquill","normal","flying",5],[521,"Unfezant","normal","flying",5],[522,"Blitzle","electric",null,5],[523,"Zebstrika","electric",null,5],[524,"Roggenrola","rock",null,5],[525,"Boldore","rock",null,5],[526,"Gigalith","rock",null,5],[527,"Woobat","psychic","flying",5],[528,"Swoobat","psychic","flying",5],[529,"Drilbur","ground",null,5],[530,"Excadrill","ground","steel",5],[531,"Audino","normal",null,5],[532,"Timburr","fighting",null,5],[533,"Gurdurr","fighting",null,5],[534,"Conkeldurr","fighting",null,5],[535,"Tympole","water",null,5],[536,"Palpitoad","water","ground",5],[537,"Seismitoad","water","ground",5],[538,"Throh","fighting",null,5],[539,"Sawk","fighting",null,5],[540,"Sewaddle","bug","grass",5],[541,"Swadloon","bug","grass",5],[542,"Leavanny","bug","grass",5],[543,"Venipede","bug","poison",5],[544,"Whirlipede","bug","poison",5],[545,"Scolipede","bug","poison",5],[546,"Cottonee","grass","fairy",5],[547,"Whimsicott","grass","fairy",5],[548,"Petilil","grass",null,5],[549,"Lilligant","grass",null,5],[550,"Basculin","water",null,5],[551,"Sandile","ground","dark",5],[552,"Krokorok","ground","dark",5],[553,"Krookodile","ground","dark",5],[554,"Darumaka","fire",null,5],[555,"Darmanitan","fire",null,5],[556,"Maractus","grass",null,5],[557,"Dwebble","bug","rock",5],[558,"Crustle","bug","rock",5],[559,"Scraggy","dark","fighting",5],[560,"Scrafty","dark","fighting",5],[561,"Sigilyph","psychic","flying",5],[562,"Yamask","ghost",null,5],[563,"Cofagrigus","ghost",null,5],[564,"Tirtouga","water","rock",5],[565,"Carracosta","water","rock",5],[566,"Archen","rock","flying",5],[567,"Archeops","rock","flying",5],[568,"Trubbish","poison",null,5],[569,"Garbodor","poison",null,5],[570,"Zorua","dark",null,5],[571,"Zoroark","dark",null,5],[572,"Minccino","normal",null,5],[573,"Cinccino","normal",null,5],[574,"Gothita","psychic",null,5],[575,"Gothorita","psychic",null,5],[576,"Gothitelle","psychic",null,5],[577,"Solosis","psychic",null,5],[578,"Duosion","psychic",null,5],[579,"Reuniclus","psychic",null,5],[580,"Ducklett","water","flying",5],[581,"Swanna","water","flying",5],[582,"Vanillite","ice",null,5],[583,"Vanillish","ice",null,5],[584,"Vanilluxe","ice",null,5],[585,"Deerling","normal","grass",5],[586,"Sawsbuck","normal","grass",5],[587,"Emolga","electric","flying",5],[588,"Karrablast","bug",null,5],[589,"Escavalier","bug","steel",5],[590,"Foongus","grass","poison",5],[591,"Amoonguss","grass","poison",5],[592,"Frillish","water","ghost",5],[593,"Jellicent","water","ghost",5],[594,"Alomomola","water",null,5],[595,"Joltik","bug","electric",5],[596,"Galvantula","bug","electric",5],[597,"Ferroseed","grass","steel",5],[598,"Ferrothorn","grass","steel",5],[599,"Klink","steel",null,5],[600,"Klang","steel",null,5],[601,"Klinklang","steel",null,5],[602,"Tynamo","electric",null,5],[603,"Eelektrik","electric",null,5],[604,"Eelektross","electric",null,5],[605,"Elgyem","psychic",null,5],[606,"Beheeyem","psychic",null,5],[607,"Litwick","ghost","fire",5],[608,"Lampent","ghost","fire",5],[609,"Chandelure","ghost","fire",5],[610,"Axew","dragon",null,5],[611,"Fraxure","dragon",null,5],[612,"Haxorus","dragon",null,5],[613,"Cubchoo","ice",null,5],[614,"Beartic","ice",null,5],[615,"Cryogonal","ice",null,5],[616,"Shelmet","bug",null,5],[617,"Accelgor","bug",null,5],[618,"Stunfisk","ground","electric",5],[619,"Mienfoo","fighting",null,5],[620,"Mienshao","fighting",null,5],[621,"Druddigon","dragon",null,5],[622,"Golett","ground","ghost",5],[623,"Golurk","ground","ghost",5],[624,"Pawniard","dark","steel",5],[625,"Bisharp","dark","steel",5],[626,"Bouffalant","normal",null,5],[627,"Rufflet","normal","flying",5],[628,"Braviary","normal","flying",5],[629,"Vullaby","dark","flying",5],[630,"Mandibuzz","dark","flying",5],[631,"Heatmor","fire",null,5],[632,"Durant","bug","steel",5],[633,"Deino","dark","dragon",5],[634,"Zweilous","dark","dragon",5],[635,"Hydreigon","dark","dragon",5],[636,"Larvesta","bug","fire",5],[637,"Volcarona","bug","fire",5],[638,"Cobalion","steel","fighting",5],[639,"Terrakion","rock","fighting",5],[640,"Virizion","grass","fighting",5],[641,"Tornadus","flying",null,5],[642,"Thundurus","electric","flying",5],[643,"Reshiram","dragon","fire",5],[644,"Zekrom","dragon","electric",5],[645,"Landorus","ground","flying",5],[646,"Kyurem","dragon","ice",5],[647,"Keldeo","water","fighting",5],[648,"Meloetta","normal","psychic",5],[649,"Genesect","bug","steel",5],
  [650,"Chespin","grass",null,6],[651,"Quilladin","grass",null,6],[652,"Chesnaught","grass","fighting",6],[653,"Fennekin","fire",null,6],[654,"Braixen","fire",null,6],[655,"Delphox","fire","psychic",6],[656,"Froakie","water",null,6],[657,"Frogadier","water",null,6],[658,"Greninja","water","dark",6],[659,"Bunnelby","normal",null,6],[660,"Diggersby","normal","ground",6],[661,"Fletchling","normal","flying",6],[662,"Fletchinder","fire","flying",6],[663,"Talonflame","fire","flying",6],[664,"Scatterbug","bug",null,6],[665,"Spewpa","bug",null,6],[666,"Vivillon","bug","flying",6],[667,"Litleo","fire","normal",6],[668,"Pyroar","fire","normal",6],[669,"Flabebe","fairy",null,6],[670,"Floette","fairy",null,6],[671,"Florges","fairy",null,6],[672,"Skiddo","grass",null,6],[673,"Gogoat","grass",null,6],[674,"Pancham","fighting",null,6],[675,"Pangoro","fighting","dark",6],[676,"Furfrou","normal",null,6],[677,"Espurr","psychic",null,6],[678,"Meowstic","psychic",null,6],[679,"Honedge","steel","ghost",6],[680,"Doublade","steel","ghost",6],[681,"Aegislash","steel","ghost",6],[682,"Spritzee","fairy",null,6],[683,"Aromatisse","fairy",null,6],[684,"Swirlix","fairy",null,6],[685,"Slurpuff","fairy",null,6],[686,"Inkay","dark","psychic",6],[687,"Malamar","dark","psychic",6],[688,"Binacle","rock","water",6],[689,"Barbaracle","rock","water",6],[690,"Skrelp","poison","water",6],[691,"Dragalge","poison","dragon",6],[692,"Clauncher","water",null,6],[693,"Clawitzer","water",null,6],[694,"Helioptile","electric","normal",6],[695,"Heliolisk","electric","normal",6],[696,"Tyrunt","rock","dragon",6],[697,"Tyrantrum","rock","dragon",6],[698,"Amaura","rock","ice",6],[699,"Aurorus","rock","ice",6],[700,"Sylveon","fairy",null,6],[701,"Hawlucha","fighting","flying",6],[702,"Dedenne","electric","fairy",6],[703,"Carbink","rock","fairy",6],[704,"Goomy","dragon",null,6],[705,"Sliggoo","dragon",null,6],[706,"Goodra","dragon",null,6],[707,"Klefki","steel","fairy",6],[708,"Phantump","ghost","grass",6],[709,"Trevenant","ghost","grass",6],[710,"Pumpkaboo","ghost","grass",6],[711,"Gourgeist","ghost","grass",6],[712,"Bergmite","ice",null,6],[713,"Avalugg","ice",null,6],[714,"Noibat","flying","dragon",6],[715,"Noivern","flying","dragon",6],[716,"Xerneas","fairy",null,6],[717,"Yveltal","dark","flying",6],[718,"Zygarde","dragon","ground",6],[719,"Diancie","rock","fairy",6],[720,"Hoopa","psychic","ghost",6],[721,"Volcanion","fire","water",6],
  [722,"Rowlet","grass","flying",7],[723,"Dartrix","grass","flying",7],[724,"Decidueye","grass","ghost",7],[725,"Litten","fire",null,7],[726,"Torracat","fire",null,7],[727,"Incineroar","fire","dark",7],[728,"Popplio","water",null,7],[729,"Brionne","water",null,7],[730,"Primarina","water","fairy",7],[731,"Pikipek","normal","flying",7],[732,"Trumbeak","normal","flying",7],[733,"Toucannon","normal","flying",7],[734,"Yungoos","normal",null,7],[735,"Gumshoos","normal",null,7],[736,"Grubbin","bug",null,7],[737,"Charjabug","bug","electric",7],[738,"Vikavolt","bug","electric",7],[739,"Crabrawler","fighting",null,7],[740,"Crabominable","fighting","ice",7],[741,"Oricorio","fire","flying",7],[742,"Cutiefly","bug","fairy",7],[743,"Ribombee","bug","fairy",7],[744,"Rockruff","rock",null,7],[745,"Lycanroc","rock",null,7],[746,"Wishiwashi","water",null,7],[747,"Mareanie","poison","water",7],[748,"Toxapex","poison","water",7],[749,"Mudbray","ground",null,7],[750,"Mudsdale","ground",null,7],[751,"Dewpider","water","bug",7],[752,"Araquanid","water","bug",7],[753,"Fomantis","grass",null,7],[754,"Lurantis","grass",null,7],[755,"Morelull","grass","fairy",7],[756,"Shiinotic","grass","fairy",7],[757,"Salandit","poison","fire",7],[758,"Salazzle","poison","fire",7],[759,"Stufful","normal","fighting",7],[760,"Bewear","normal","fighting",7],[761,"Bounsweet","grass",null,7],[762,"Steenee","grass",null,7],[763,"Tsareena","grass",null,7],[764,"Comfey","fairy",null,7],[765,"Oranguru","normal","psychic",7],[766,"Passimian","fighting",null,7],[767,"Wimpod","bug","water",7],[768,"Golisopod","bug","water",7],[769,"Sandygast","ghost","ground",7],[770,"Palossand","ghost","ground",7],[771,"Pyukumuku","water",null,7],[772,"Type: Null","normal",null,7],[773,"Silvally","normal",null,7],[774,"Minior","rock","flying",7],[775,"Komala","normal",null,7],[776,"Turtonator","fire","dragon",7],[777,"Togedemaru","electric","steel",7],[778,"Mimikyu","ghost","fairy",7],[779,"Bruxish","water","psychic",7],[780,"Drampa","normal","dragon",7],[781,"Dhelmise","ghost","grass",7],[782,"Jangmo-o","dragon",null,7],[783,"Hakamo-o","dragon","fighting",7],[784,"Kommo-o","dragon","fighting",7],[785,"Tapu Koko","electric","fairy",7],[786,"Tapu Lele","psychic","fairy",7],[787,"Tapu Bulu","grass","fairy",7],[788,"Tapu Fini","water","fairy",7],[789,"Cosmog","psychic",null,7],[790,"Cosmoem","psychic",null,7],[791,"Solgaleo","psychic","steel",7],[792,"Lunala","psychic","ghost",7],[793,"Nihilego","rock","poison",7],[794,"Buzzwole","bug","fighting",7],[795,"Pheromosa","bug","fighting",7],[796,"Xurkitree","electric",null,7],[797,"Celesteela","steel","flying",7],[798,"Kartana","grass","steel",7],[799,"Guzzlord","dark","dragon",7],[800,"Necrozma","psychic",null,7],[801,"Magearna","steel","fairy",7],[802,"Marshadow","fighting","ghost",7],[803,"Poipole","poison",null,7],[804,"Naganadel","poison","dragon",7],[805,"Stakataka","rock","steel",7],[806,"Blacephalon","fire","ghost",7],[807,"Zeraora","electric",null,7],[808,"Meltan","steel",null,7],[809,"Melmetal","steel",null,7],
  [810,"Grookey","grass",null,8],[811,"Thwackey","grass",null,8],[812,"Rillaboom","grass",null,8],[813,"Scorbunny","fire",null,8],[814,"Raboot","fire",null,8],[815,"Cinderace","fire",null,8],[816,"Sobble","water",null,8],[817,"Drizzile","water",null,8],[818,"Inteleon","water",null,8],[819,"Skwovet","normal",null,8],[820,"Greedent","normal",null,8],[821,"Rookidee","flying",null,8],[822,"Corvisquire","flying",null,8],[823,"Corviknight","flying","steel",8],[824,"Blipbug","bug",null,8],[825,"Dottler","bug","psychic",8],[826,"Orbeetle","bug","psychic",8],[827,"Nickit","dark",null,8],[828,"Thievul","dark",null,8],[829,"Gossifleur","grass",null,8],[830,"Eldegoss","grass",null,8],[831,"Wooloo","normal",null,8],[832,"Dubwool","normal",null,8],[833,"Chewtle","water",null,8],[834,"Drednaw","water","rock",8],[835,"Yamper","electric",null,8],[836,"Boltund","electric",null,8],[837,"Rolycoly","rock",null,8],[838,"Carkol","rock","fire",8],[839,"Coalossal","rock","fire",8],[840,"Applin","grass","dragon",8],[841,"Flapple","grass","dragon",8],[842,"Appletun","grass","dragon",8],[843,"Silicobra","ground",null,8],[844,"Sandaconda","ground",null,8],[845,"Cramorant","flying","water",8],[846,"Arrokuda","water",null,8],[847,"Barraskewda","water",null,8],[848,"Toxel","electric","poison",8],[849,"Toxtricity","electric","poison",8],[850,"Sizzlipede","fire","bug",8],[851,"Centiskorch","fire","bug",8],[852,"Clobbopus","fighting",null,8],[853,"Grapploct","fighting",null,8],[854,"Sinistea","ghost",null,8],[855,"Polteageist","ghost",null,8],[856,"Hatenna","psychic",null,8],[857,"Hattrem","psychic",null,8],[858,"Hatterene","psychic","fairy",8],[859,"Impidimp","dark","fairy",8],[860,"Morgrem","dark","fairy",8],[861,"Grimmsnarl","dark","fairy",8],[862,"Obstagoon","dark","normal",8],[863,"Perrserker","steel",null,8],[864,"Cursola","ghost",null,8],[865,"Sirfetch'd","fighting",null,8],[866,"Mr. Rime","ice","psychic",8],[867,"Runerigus","ground","ghost",8],[868,"Milcery","fairy",null,8],[869,"Alcremie","fairy",null,8],[870,"Falinks","fighting",null,8],[871,"Pincurchin","electric",null,8],[872,"Snom","ice","bug",8],[873,"Frosmoth","ice","bug",8],[874,"Stonjourner","rock",null,8],[875,"Eiscue","ice",null,8],[876,"Indeedee","psychic","normal",8],[877,"Morpeko","electric","dark",8],[878,"Cufant","steel",null,8],[879,"Copperajah","steel",null,8],[880,"Dracozolt","electric","dragon",8],[881,"Arctozolt","electric","ice",8],[882,"Dracovish","water","dragon",8],[883,"Arctovish","water","ice",8],[884,"Duraludon","steel","dragon",8],[885,"Dreepy","dragon","ghost",8],[886,"Drakloak","dragon","ghost",8],[887,"Dragapult","dragon","ghost",8],[888,"Zacian","fairy",null,8],[889,"Zamazenta","fighting",null,8],[890,"Eternatus","poison","dragon",8],[891,"Kubfu","fighting",null,8],[892,"Urshifu","fighting","dark",8],[893,"Zarude","dark","grass",8],[894,"Regieleki","electric",null,8],[895,"Regidrago","dragon",null,8],[896,"Glastrier","ice",null,8],[897,"Spectrier","ghost",null,8],[898,"Calyrex","psychic","grass",8],[899,"Wyrdeer","normal","psychic",8],[900,"Kleavor","bug","rock",8],[901,"Ursaluna","ground","normal",8],[902,"Basculegion","water","ghost",8],[903,"Sneasler","fighting","poison",8],[904,"Overqwil","dark","poison",8],[905,"Enamorus","fairy","flying",8],
  [906,"Sprigatito","grass",null,9],[907,"Floragato","grass",null,9],[908,"Meowscarada","grass","dark",9],[909,"Fuecoco","fire",null,9],[910,"Crocalor","fire",null,9],[911,"Skeledirge","fire","ghost",9],[912,"Quaxly","water",null,9],[913,"Quaxwell","water",null,9],[914,"Quaquaval","water","fighting",9],[915,"Lechonk","normal",null,9],[916,"Oinkologne","normal",null,9],[917,"Tarountula","bug",null,9],[918,"Spidops","bug",null,9],[919,"Nymble","bug",null,9],[920,"Lokix","bug","dark",9],[921,"Pawmi","electric",null,9],[922,"Pawmo","electric","fighting",9],[923,"Pawmot","electric","fighting",9],[924,"Tandemaus","normal",null,9],[925,"Maushold","normal",null,9],[926,"Fidough","fairy",null,9],[927,"Dachsbun","fairy",null,9],[928,"Smoliv","grass","normal",9],[929,"Dolliv","grass","normal",9],[930,"Arboliva","grass","normal",9],[931,"Squawkabilly","normal","flying",9],[932,"Nacli","rock",null,9],[933,"Naclstack","rock",null,9],[934,"Garganacl","rock",null,9],[935,"Charcadet","fire",null,9],[936,"Armarouge","fire","psychic",9],[937,"Ceruledge","fire","ghost",9],[938,"Tadbulb","electric",null,9],[939,"Bellibolt","electric",null,9],[940,"Wattrel","electric","flying",9],[941,"Kilowattrel","electric","flying",9],[942,"Maschiff","dark",null,9],[943,"Mabosstiff","dark",null,9],[944,"Shroodle","poison","normal",9],[945,"Grafaiai","poison","normal",9],[946,"Bramblin","grass","ghost",9],[947,"Brambleghast","grass","ghost",9],[948,"Toedscool","ground","grass",9],[949,"Toedscruel","ground","grass",9],[950,"Klawf","rock",null,9],[951,"Capsakid","grass",null,9],[952,"Scovillain","grass","fire",9],[953,"Rellor","bug",null,9],[954,"Rabsca","bug","psychic",9],[955,"Flittle","psychic",null,9],[956,"Espathra","psychic",null,9],[957,"Tinkatink","fairy","steel",9],[958,"Tinkatuff","fairy","steel",9],[959,"Tinkaton","fairy","steel",9],[960,"Wiglett","water",null,9],[961,"Wugtrio","water",null,9],[962,"Bombirdier","flying","dark",9],[963,"Finizen","water",null,9],[964,"Palafin","water",null,9],[965,"Varoom","steel","poison",9],[966,"Revavroom","steel","poison",9],[967,"Cyclizar","dragon","normal",9],[968,"Orthworm","steel",null,9],[969,"Glimmet","rock","poison",9],[970,"Glimmora","rock","poison",9],[971,"Greavard","ghost",null,9],[972,"Houndstone","ghost",null,9],[973,"Flamigo","flying","fighting",9],[974,"Cetoddle","ice",null,9],[975,"Cetitan","ice",null,9],[976,"Veluza","water","psychic",9],[977,"Dondozo","water",null,9],[978,"Tatsugiri","dragon","water",9],[979,"Annihilape","fighting","ghost",9],[980,"Clodsire","poison","ground",9],[981,"Farigiraf","normal","psychic",9],[982,"Dudunsparce","normal",null,9],[983,"Kingambit","dark","steel",9],[984,"Great Tusk","ground","fighting",9],[985,"Scream Tail","fairy","psychic",9],[986,"Brute Bonnet","grass","dark",9],[987,"Flutter Mane","ghost","fairy",9],[988,"Slither Wing","bug","fighting",9],[989,"Sandy Shocks","electric","ground",9],[990,"Iron Treads","ground","steel",9],[991,"Iron Bundle","ice","water",9],[992,"Iron Hands","fighting","electric",9],[993,"Iron Jugulis","dark","flying",9],[994,"Iron Moth","fire","poison",9],[995,"Iron Thorns","rock","electric",9],[996,"Frigibax","dragon","ice",9],[997,"Arctibax","dragon","ice",9],[998,"Baxcalibur","dragon","ice",9],[999,"Gimmighoul","ghost",null,9],[1000,"Gholdengo","steel","ghost",9],[1001,"Wo-Chien","dark","grass",9],[1002,"Chien-Pao","dark","ice",9],[1003,"Ting-Lu","dark","ground",9],[1004,"Chi-Yu","dark","fire",9],[1005,"Roaring Moon","dragon","dark",9],[1006,"Iron Valiant","fairy","fighting",9],[1007,"Koraidon","fighting","dragon",9],[1008,"Miraidon","electric","dragon",9],[1009,"Walking Wake","water","dragon",9],[1010,"Iron Leaves","grass","psychic",9],[1011,"Dipplin","grass","dragon",9],[1012,"Poltchageist","grass","ghost",9],[1013,"Sinistcha","grass","ghost",9],[1014,"Okidogi","poison","fighting",9],[1015,"Munkidori","poison","psychic",9],[1016,"Fezandipiti","poison","fairy",9],[1017,"Ogerpon","grass",null,9],[1018,"Archaludon","steel","dragon",9],[1019,"Hydrapple","grass","dragon",9],[1020,"Gouging Fire","fire","dragon",9],[1021,"Raging Bolt","electric","dragon",9],[1022,"Iron Boulder","rock","psychic",9],[1023,"Iron Crown","steel","psychic",9],[1024,"Terapagos","normal",null,9],[1025,"Pecharunt","poison","ghost",9]
];

const STATIC_POKEMON = POKEMON_DATA.map(([id, name, type1, type2, gen]) =>
  makePokemonObj(id, name, type1, type2, gen)
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================================
// MAIN GAME COMPONENT
// ============================================================================
export default function GuessThePokemon() {
  const [screen, setScreen] = useState("title"); // title, select, game, results
  const [selectedGens, setSelectedGens] = useState([1]);
  const [gameMode, setGameMode] = useState("silhouette"); // silhouette, zoom, type-challenge
  const [difficulty, setDifficulty] = useState("normal"); // easy, normal, hard

  // Dynamic Pokémon database (static fallback + synced new entries)
  const [allPokemon, setAllPokemon] = useState(STATIC_POKEMON);
  const [generations, setGenerations] = useState(GENERATIONS_STATIC);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle, syncing, synced, error
  const [syncMessage, setSyncMessage] = useState("");
  const [newCount, setNewCount] = useState(0);

  // Background sync on mount
  useEffect(() => {
    let cancelled = false;
    const doSync = async () => {
      setSyncStatus("syncing");
      setSyncMessage("Checking for new Pokémon...");

      const { newPokemon, newGens } = await syncNewPokemon((msg) => {
        if (!cancelled) setSyncMessage(msg);
      });

      if (cancelled) return;

      if (newPokemon.length > 0) {
        setAllPokemon(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const unique = newPokemon.filter(p => !existingIds.has(p.id));
          return [...prev, ...unique].sort((a, b) => a.id - b.id);
        });

        // Update generation ranges for existing gens that got extended
        setGenerations(prev => {
          const updated = { ...prev };
          for (const p of newPokemon) {
            if (updated[p.gen]) {
              const [start, end] = updated[p.gen].range;
              updated[p.gen] = {
                ...updated[p.gen],
                range: [Math.min(start, p.id), Math.max(end, p.id)],
              };
            }
          }
          // Add entirely new generations
          for (const [genNum, genInfo] of Object.entries(newGens)) {
            if (!updated[genNum]) {
              updated[parseInt(genNum)] = genInfo;
            }
          }
          return updated;
        });

        setNewCount(newPokemon.length);
        setSyncStatus("synced");
        setSyncMessage(`+${newPokemon.length} new Pokémon synced!`);
      } else {
        setSyncStatus("synced");
        setSyncMessage("Database is up to date");
      }

      // Clear message after a few seconds
      setTimeout(() => {
        if (!cancelled) setSyncMessage("");
      }, 4000);
    };

    doSync();
    return () => { cancelled = true; };
  }, []);

  const getGenPokemon = useCallback(
    (gens) => allPokemon.filter(p => gens.includes(p.gen)),
    [allPokemon]
  );

  
  // Game state
  const [currentPokemon, setCurrentPokemon] = useState(null);
  const [choices, setChoices] = useState([]);
  const [guess, setGuess] = useState("");
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundHistory, setRoundHistory] = useState([]);
  const [particles, setParticles] = useState([]);
  const [shakeWrong, setShakeWrong] = useState(false);
  const [caught, setCaught] = useState([]);
  const [comboText, setComboText] = useState("");
  const [zoomLevel, setZoomLevel] = useState(8);
  const [zoomOffset, setZoomOffset] = useState({ x: 0.5, y: 0.5 });
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);

  const difficultyConfig = {
    easy: { time: 30, hints: 3, baseScore: 50, choices: 4, label: "Easy" },
    normal: { time: 20, hints: 2, baseScore: 100, choices: 0, label: "Normal" },
    hard: { time: 12, hints: 1, baseScore: 200, choices: 0, label: "Hard" },
  };

  const config = difficultyConfig[difficulty];

  // Timer effect
  useEffect(() => {
    if (screen === "game" && !revealed && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
      return () => clearTimeout(timerRef.current);
    }
    if (screen === "game" && !revealed && timeLeft === 0 && currentPokemon) {
      handleReveal(false);
    }
  }, [timeLeft, screen, revealed]);

  // Focus input
  useEffect(() => {
    if (screen === "game" && !revealed && inputRef.current && gameMode !== "type-challenge" && difficulty !== "easy") {
      inputRef.current.focus();
    }
  }, [screen, revealed, round]);

  const spawnParticles = useCallback((color, count = 20) => {
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 40 + (Math.random() - 0.5) * 20,
      color,
      angle: Math.random() * 360,
      speed: 2 + Math.random() * 4,
      size: 4 + Math.random() * 8,
      life: 1,
    }));
    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => setParticles(prev => prev.filter(p => !newParticles.includes(p))), 1500);
  }, []);

  const startGame = useCallback(() => {
    const pool = getGenPokemon(selectedGens);
    if (pool.length < 4) return;
    setRound(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setHintsUsed(0);
    setRoundHistory([]);
    setCaught([]);
    setScreen("game");
    nextRound(pool, 0);
  }, [selectedGens, gameMode, difficulty]);

  const nextRound = useCallback((pool, roundNum) => {
    const shuffled = shuffle(pool);
    const pokemon = shuffled[0];
    const wrongChoices = shuffle(shuffled.filter(p => p.id !== pokemon.id)).slice(0, 3);
    const allChoices = shuffle([pokemon, ...wrongChoices]);
    
    setCurrentPokemon(pokemon);
    setChoices(allChoices);
    setGuess("");
    setRevealed(false);
    setIsCorrect(null);
    setCurrentHint(0);
    setRound(roundNum + 1);
    setTimeLeft(config.time);
    setShakeWrong(false);
    setComboText("");
    setImageLoaded(false);
    
    if (gameMode === "zoom") {
      setZoomLevel(8);
      setZoomOffset({ x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 });
    }
  }, [gameMode, config]);

  const handleReveal = useCallback((correct) => {
    clearTimeout(timerRef.current);
    setRevealed(true);
    setIsCorrect(correct);
    
    if (correct) {
      const timeBonus = Math.floor(timeLeft * 5);
      const streakBonus = streak * 25;
      const hintPenalty = currentHint * 20;
      const roundScore = Math.max(10, config.baseScore + timeBonus + streakBonus - hintPenalty);
      setScore(s => s + roundScore);
      setStreak(s => s + 1);
      setBestStreak(b => Math.max(b, streak + 1));
      setCaught(c => [...c, currentPokemon]);
      
      const typeColor = TYPE_COLORS[currentPokemon.type1] || "#FFD700";
      spawnParticles(typeColor, 30);
      
      if (streak + 1 >= 10) setComboText("LEGENDARY!");
      else if (streak + 1 >= 7) setComboText("SUPER EFFECTIVE!");
      else if (streak + 1 >= 5) setComboText("ON FIRE!");
      else if (streak + 1 >= 3) setComboText("GREAT!");
    } else {
      setStreak(0);
      setShakeWrong(true);
      setTimeout(() => setShakeWrong(false), 600);
    }
  }, [timeLeft, streak, currentHint, config, currentPokemon, spawnParticles]);

  const handleGuess = useCallback((guessName) => {
    if (revealed) return;
    const correct = guessName.toLowerCase().replace(/[^a-z0-9]/g, '') === 
                    currentPokemon.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    setRoundHistory(h => [...h, { pokemon: currentPokemon, correct, time: config.time - timeLeft }]);
    handleReveal(correct);
  }, [currentPokemon, revealed, handleReveal, config, timeLeft]);

  const handleSubmitGuess = useCallback((e) => {
    e?.preventDefault?.();
    if (guess.trim()) handleGuess(guess.trim());
  }, [guess, handleGuess]);

  const useHint = useCallback(() => {
    if (currentHint < config.hints && !revealed) {
      setCurrentHint(h => h + 1);
      setHintsUsed(h => h + 1);
      if (gameMode === "zoom") {
        setZoomLevel(z => Math.max(2, z - 2));
      }
    }
  }, [currentHint, config, revealed, gameMode]);

  const handleNext = useCallback(() => {
    if (round >= totalRounds) {
      setScreen("results");
    } else {
      const pool = getGenPokemon(selectedGens);
      nextRound(pool, round);
    }
  }, [round, totalRounds, selectedGens, nextRound]);

  const getHintText = () => {
    if (!currentPokemon) return "";
    const hints = [
      `Type: ${currentPokemon.type1}${currentPokemon.type2 ? ` / ${currentPokemon.type2}` : ''}`,
      `Starts with: ${currentPokemon.name[0].toUpperCase()}`,
      `${currentPokemon.name.length} letters: ${currentPokemon.name[0]}${"_".repeat(currentPokemon.name.length - 1)}`,
    ];
    return hints.slice(0, currentHint);
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const TypeBadge = ({ type }) => (
    <span style={{
      background: TYPE_COLORS[type] || "#888",
      color: "#fff",
      padding: "3px 12px",
      borderRadius: "20px",
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "1px",
      display: "inline-block",
      textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    }}>{type}</span>
  );

  // TITLE SCREEN
  if (screen === "title") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Trebuchet MS', 'Lucida Sans', sans-serif",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Animated background orbs */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            width: `${100 + i * 60}px`,
            height: `${100 + i * 60}px`,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${["#E6394620","#FFB70320","#2A9D8F20","#457B9D20","#F7258520","#9B5DE520"][i]} 0%, transparent 70%)`,
            animation: `float${i} ${8 + i * 2}s ease-in-out infinite`,
            top: `${10 + i * 12}%`,
            left: `${5 + i * 15}%`,
          }} />
        ))}
        
        <style>{`
          @keyframes float0 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -40px) scale(1.1); } }
          @keyframes float1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-40px, 30px) scale(1.2); } }
          @keyframes float2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(50px, 20px) scale(1.05); } }
          @keyframes float3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20px, -50px) scale(1.15); } }
          @keyframes float4 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(40px, -30px) scale(1.08); } }
          @keyframes float5 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-30px, 40px) scale(1.12); } }
          @keyframes pokeball-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes title-glow { 0%, 100% { text-shadow: 0 0 20px #FFD700, 0 0 40px #FF6B35, 0 0 60px #FF6B3540; } 50% { text-shadow: 0 0 30px #FFD700, 0 0 60px #FF6B35, 0 0 80px #FF6B3560; } }
          @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes pulse-btn { 0%, 100% { box-shadow: 0 0 20px #FFD70040; } 50% { box-shadow: 0 0 40px #FFD70080; } }
        `}</style>

        {/* Pokeball icon */}
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "linear-gradient(180deg, #E63946 50%, #fff 50%)",
          border: "4px solid #333",
          position: "relative",
          marginBottom: 24,
          animation: "pokeball-spin 3s ease-in-out infinite",
        }}>
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: 24, height: 24, borderRadius: "50%", background: "#fff",
            border: "4px solid #333", zIndex: 2,
          }} />
          <div style={{
            position: "absolute", top: "50%", left: 0, right: 0,
            height: 4, background: "#333", transform: "translateY(-50%)",
          }} />
        </div>

        <h1 style={{
          fontSize: "clamp(28px, 6vw, 56px)",
          fontWeight: 900,
          color: "#FFD700",
          textAlign: "center",
          margin: "0 0 8px",
          animation: "title-glow 3s ease-in-out infinite",
          letterSpacing: "-1px",
          lineHeight: 1.1,
        }}>
          WHO'S THAT<br/>POKÉMON?
        </h1>
        
        <p style={{
          color: "#8892b0",
          fontSize: 16,
          margin: "0 0 40px",
          animation: "slide-up 0.8s ease-out 0.3s both",
          letterSpacing: "3px",
          textTransform: "uppercase",
        }}>
          The Ultimate Challenge
        </p>

        <button
          onClick={() => setScreen("select")}
          style={{
            background: "linear-gradient(135deg, #FFD700 0%, #FF6B35 100%)",
            color: "#1a0a2e",
            border: "none",
            padding: "16px 48px",
            fontSize: 20,
            fontWeight: 800,
            borderRadius: 50,
            cursor: "pointer",
            animation: "slide-up 0.8s ease-out 0.5s both, pulse-btn 2s ease-in-out infinite",
            letterSpacing: "2px",
            textTransform: "uppercase",
            transition: "transform 0.2s",
          }}
          onMouseEnter={e => e.target.style.transform = "scale(1.05)"}
          onMouseLeave={e => e.target.style.transform = "scale(1)"}
        >
          START GAME
        </button>

        {/* Sync status indicator */}
        {syncMessage && (
          <div style={{
            marginTop: 16,
            padding: "6px 16px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.5,
            animation: "slide-up 0.4s ease-out",
            background: syncStatus === "syncing" ? "#FFB70315" : newCount > 0 ? "#2A9D8F15" : "#ffffff08",
            border: `1px solid ${syncStatus === "syncing" ? "#FFB70330" : newCount > 0 ? "#2A9D8F30" : "#ffffff15"}`,
            color: syncStatus === "syncing" ? "#FFB703" : newCount > 0 ? "#2A9D8F" : "#8892b0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            {syncStatus === "syncing" && (
              <span style={{ display: "inline-block", animation: "pokeball-spin 1s linear infinite", fontSize: 14 }}>⟳</span>
            )}
            {syncStatus === "synced" && newCount > 0 && <span>✦</span>}
            {syncMessage}
          </div>
        )}
        
        <div style={{
          position: "absolute",
          bottom: 20,
          color: "#4a5568",
          fontSize: 12,
          letterSpacing: 1,
        }}>
          {allPokemon.length.toLocaleString()} POKÉMON &bull; {Object.keys(generations).length} GENERATIONS &bull; 3 GAME MODES
        </div>
      </div>
    );
  }

  // SELECTION SCREEN
  if (screen === "select") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
        fontFamily: "'Trebuchet MS', 'Lucida Sans', sans-serif",
        color: "#e2e8f0",
        padding: "20px",
        overflowY: "auto",
      }}>
        <style>{`
          @keyframes fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        <button onClick={() => setScreen("title")} style={{
          background: "transparent",
          border: "1px solid #ffffff20",
          color: "#8892b0",
          padding: "8px 16px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 14,
          marginBottom: 16,
        }}>
          ← Back
        </button>

        <h2 style={{
          fontSize: 28, fontWeight: 800, color: "#FFD700",
          margin: "0 0 24px", textAlign: "center",
        }}>CHOOSE YOUR CHALLENGE</h2>

        {/* Game Mode Selection */}
        <div style={{ maxWidth: 700, margin: "0 auto 32px" }}>
          <h3 style={{ color: "#ccd6f6", fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            GAME MODE
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { id: "silhouette", name: "Silhouette", desc: "Classic shadow guess", icon: "👤" },
              { id: "zoom", name: "Zoom In", desc: "Guess from a closeup", icon: "🔍" },
              { id: "type-challenge", name: "Type Expert", desc: "Identify by type clues", icon: "⚡" },
            ].map((mode, i) => (
              <button key={mode.id} onClick={() => setGameMode(mode.id)} style={{
                background: gameMode === mode.id
                  ? "linear-gradient(135deg, #FFD70030, #FF6B3520)"
                  : "#ffffff08",
                border: gameMode === mode.id ? "2px solid #FFD700" : "2px solid #ffffff10",
                borderRadius: 16,
                padding: "16px",
                cursor: "pointer",
                textAlign: "left",
                animation: `fade-in 0.4s ease-out ${i * 0.1}s both`,
                transition: "all 0.3s",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{mode.icon}</div>
                <div style={{ color: gameMode === mode.id ? "#FFD700" : "#ccd6f6", fontWeight: 700, fontSize: 16 }}>{mode.name}</div>
                <div style={{ color: "#8892b0", fontSize: 12, marginTop: 4 }}>{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty Selection */}
        <div style={{ maxWidth: 700, margin: "0 auto 32px" }}>
          <h3 style={{ color: "#ccd6f6", fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            DIFFICULTY
          </h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { id: "easy", label: "Easy", desc: "Multiple choice, 30s", color: "#2A9D8F" },
              { id: "normal", label: "Normal", desc: "Type answer, 20s", color: "#FFB703" },
              { id: "hard", label: "Hard", desc: "Type answer, 12s, fewer hints", color: "#E63946" },
            ].map(d => (
              <button key={d.id} onClick={() => setDifficulty(d.id)} style={{
                flex: 1, minWidth: 140,
                background: difficulty === d.id ? `${d.color}25` : "#ffffff08",
                border: difficulty === d.id ? `2px solid ${d.color}` : "2px solid #ffffff10",
                borderRadius: 12,
                padding: "12px 16px",
                cursor: "pointer",
                transition: "all 0.3s",
              }}>
                <div style={{ color: difficulty === d.id ? d.color : "#ccd6f6", fontWeight: 700, fontSize: 15 }}>{d.label}</div>
                <div style={{ color: "#8892b0", fontSize: 11, marginTop: 2 }}>{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Generation Selection */}
        <div style={{ maxWidth: 700, margin: "0 auto 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ color: "#ccd6f6", fontSize: 14, letterSpacing: 2, textTransform: "uppercase", margin: 0 }}>
              EXPANSIONS (GENERATIONS)
            </h3>
            <button onClick={() => {
              const allGens = Object.keys(generations).map(Number);
              setSelectedGens(selectedGens.length === allGens.length ? [1] : allGens);
            }} style={{
              background: "transparent", border: "1px solid #ffffff20",
              color: "#FFD700", fontSize: 12, padding: "4px 12px",
              borderRadius: 6, cursor: "pointer",
            }}>
              {selectedGens.length === Object.keys(generations).length ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {Object.entries(generations).map(([gen, info], i) => {
              const genNum = parseInt(gen);
              const selected = selectedGens.includes(genNum);
              const count = info.range[1] - info.range[0] + 1;
              return (
                <button key={gen} onClick={() => {
                  setSelectedGens(prev => {
                    if (prev.includes(genNum)) {
                      const next = prev.filter(g => g !== genNum);
                      return next.length === 0 ? [genNum] : next;
                    }
                    return [...prev, genNum];
                  });
                }} style={{
                  background: selected ? `${info.color}20` : "#ffffff05",
                  border: selected ? `2px solid ${info.color}` : "2px solid #ffffff08",
                  borderRadius: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  animation: `fade-in 0.4s ease-out ${i * 0.05}s both`,
                  transition: "all 0.25s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                    <span style={{
                      background: selected ? info.color : "#ffffff20",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontWeight: 700,
                    }}>{count}</span>
                  </div>
                  <div style={{ color: selected ? "#fff" : "#8892b0", fontWeight: 700, fontSize: 14, marginTop: 6 }}>
                    {info.label}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{info.region}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rounds Selection */}
        <div style={{ maxWidth: 700, margin: "0 auto 32px" }}>
          <h3 style={{ color: "#ccd6f6", fontSize: 14, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            ROUNDS: {totalRounds}
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            {[5, 10, 15, 20, 30].map(n => (
              <button key={n} onClick={() => setTotalRounds(n)} style={{
                flex: 1,
                background: totalRounds === n ? "#FFD70025" : "#ffffff08",
                border: totalRounds === n ? "2px solid #FFD700" : "2px solid #ffffff10",
                borderRadius: 8,
                padding: "10px",
                color: totalRounds === n ? "#FFD700" : "#8892b0",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.2s",
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* START Button */}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <button onClick={startGame} style={{
            background: "linear-gradient(135deg, #FFD700 0%, #FF6B35 100%)",
            color: "#1a0a2e",
            border: "none",
            padding: "16px 64px",
            fontSize: 20,
            fontWeight: 800,
            borderRadius: 50,
            cursor: "pointer",
            letterSpacing: 2,
            textTransform: "uppercase",
            transition: "transform 0.2s",
          }}
          onMouseEnter={e => e.target.style.transform = "scale(1.05)"}
          onMouseLeave={e => e.target.style.transform = "scale(1)"}
          >
            BEGIN CHALLENGE
          </button>
          <p style={{ color: "#4a5568", fontSize: 12, marginTop: 12 }}>
            {getGenPokemon(selectedGens).length} Pokémon in pool
          </p>
        </div>
      </div>
    );
  }

  // RESULTS SCREEN
  if (screen === "results") {
    const correctCount = roundHistory.filter(r => r.correct).length;
    const accuracy = Math.round((correctCount / roundHistory.length) * 100);
    const avgTime = roundHistory.length > 0
      ? (roundHistory.reduce((s, r) => s + r.time, 0) / roundHistory.length).toFixed(1)
      : 0;

    const getRank = () => {
      if (accuracy >= 95) return { title: "POKÉMON MASTER", color: "#FFD700", icon: "👑" };
      if (accuracy >= 80) return { title: "ELITE FOUR", color: "#9B5DE5", icon: "⭐" };
      if (accuracy >= 60) return { title: "GYM LEADER", color: "#2A9D8F", icon: "🏅" };
      if (accuracy >= 40) return { title: "TRAINER", color: "#457B9D", icon: "🎒" };
      return { title: "ROOKIE", color: "#E63946", icon: "🌱" };
    };
    const rank = getRank();

    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
        fontFamily: "'Trebuchet MS', 'Lucida Sans', sans-serif",
        color: "#e2e8f0",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <style>{`
          @keyframes result-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
          @keyframes result-slide { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes rank-glow { 0%, 100% { filter: drop-shadow(0 0 10px ${rank.color}40); } 50% { filter: drop-shadow(0 0 25px ${rank.color}80); } }
        `}</style>

        <div style={{ animation: "result-pop 0.6s ease-out", textAlign: "center", marginTop: 20 }}>
          <div style={{ fontSize: 64, animation: "rank-glow 2s infinite" }}>{rank.icon}</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: rank.color, margin: "8px 0" }}>{rank.title}</h1>
          <p style={{ color: "#8892b0", fontSize: 14, letterSpacing: 2 }}>CHALLENGE COMPLETE</p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
          maxWidth: 400,
          width: "100%",
          margin: "32px 0",
          animation: "result-slide 0.6s ease-out 0.2s both",
        }}>
          {[
            { label: "SCORE", value: score.toLocaleString(), color: "#FFD700" },
            { label: "ACCURACY", value: `${accuracy}%`, color: "#2A9D8F" },
            { label: "BEST STREAK", value: `${bestStreak}x`, color: "#FF6B35" },
            { label: "AVG TIME", value: `${avgTime}s`, color: "#457B9D" },
          ].map((stat, i) => (
            <div key={i} style={{
              background: "#ffffff08",
              borderRadius: 16,
              padding: "20px 16px",
              textAlign: "center",
              border: `1px solid ${stat.color}30`,
            }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#8892b0", letterSpacing: 1, marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Round history scroll */}
        <div style={{
          maxWidth: 400, width: "100%",
          animation: "result-slide 0.6s ease-out 0.4s both",
          maxHeight: 280, overflowY: "auto",
          marginBottom: 24,
          background: "#ffffff05",
          borderRadius: 16,
          padding: 12,
        }}>
          <h3 style={{ fontSize: 12, letterSpacing: 2, color: "#64748b", margin: "0 0 8px", textTransform: "uppercase" }}>
            Round History
          </h3>
          {roundHistory.map((r, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: i < roundHistory.length - 1 ? "1px solid #ffffff08" : "none",
            }}>
              <img
                src={r.pokemon.spriteSmall}
                alt=""
                style={{ width: 36, height: 36, imageRendering: "pixelated" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ccd6f6" }}>{r.pokemon.name}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  <TypeBadge type={r.pokemon.type1} />
                  {r.pokemon.type2 && <TypeBadge type={r.pokemon.type2} />}
                </div>
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: r.correct ? "#2A9D8F" : "#E63946",
              }}>
                {r.correct ? `✓ ${r.time}s` : "✗"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, animation: "result-slide 0.6s ease-out 0.6s both" }}>
          <button onClick={() => startGame()} style={{
            background: "linear-gradient(135deg, #FFD700, #FF6B35)",
            color: "#1a0a2e", border: "none",
            padding: "14px 36px", borderRadius: 50,
            fontWeight: 800, fontSize: 16, cursor: "pointer",
            letterSpacing: 1,
          }}>PLAY AGAIN</button>
          <button onClick={() => setScreen("select")} style={{
            background: "transparent",
            border: "2px solid #ffffff20",
            color: "#ccd6f6",
            padding: "14px 24px", borderRadius: 50,
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>CHANGE SETTINGS</button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // GAME SCREEN
  // ============================================================================
  const timerPct = (timeLeft / config.time) * 100;
  const timerColor = timeLeft <= 5 ? "#E63946" : timeLeft <= 10 ? "#FFB703" : "#2A9D8F";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
      fontFamily: "'Trebuchet MS', 'Lucida Sans', sans-serif",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
        @keyframes reveal-grow { from { transform: scale(0.8); opacity: 0; filter: brightness(0); } to { transform: scale(1); opacity: 1; filter: brightness(1); } }
        @keyframes correct-flash { 0% { box-shadow: 0 0 0 0 #2A9D8F80; } 50% { box-shadow: 0 0 40px 20px #2A9D8F40; } 100% { box-shadow: 0 0 0 0 transparent; } }
        @keyframes wrong-flash { 0% { box-shadow: 0 0 0 0 #E6394680; } 50% { box-shadow: 0 0 40px 20px #E6394640; } 100% { box-shadow: 0 0 0 0 transparent; } }
        @keyframes particle-fly { 
          0% { opacity: 1; transform: translate(0, 0) scale(1); } 
          100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0); }
        }
        @keyframes combo-pop { 0% { transform: scale(0) rotate(-10deg); opacity: 0; } 50% { transform: scale(1.2) rotate(5deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes timer-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes hint-slide { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes silhouette-hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes zoom-pulse { 0%, 100% { outline-color: #FFD70040; } 50% { outline-color: #FFD70080; } }
        input::placeholder { color: #4a5568; }
      `}</style>

      {/* PARTICLES */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: p.size,
          height: p.size,
          borderRadius: "50%",
          background: p.color,
          pointerEvents: "none",
          zIndex: 100,
          animation: "particle-fly 1.2s ease-out forwards",
          "--px": `${Math.cos(p.angle) * p.speed * 40}px`,
          "--py": `${Math.sin(p.angle) * p.speed * 40 - 60}px`,
        }} />
      ))}

      {/* HEADER BAR */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        background: "#ffffff05",
        borderBottom: "1px solid #ffffff08",
        flexShrink: 0,
      }}>
        <button onClick={() => { clearTimeout(timerRef.current); setScreen("select"); }} style={{
          background: "transparent", border: "none", color: "#8892b0",
          cursor: "pointer", fontSize: 14, padding: "4px 8px",
        }}>✕ Quit</button>
        
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1 }}>ROUND</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#ccd6f6" }}>{round}/{totalRounds}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "#ffffff10" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1 }}>SCORE</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#FFD700" }}>{score}</div>
          </div>
          <div style={{ width: 1, height: 30, background: "#ffffff10" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 1 }}>STREAK</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#FF6B35" }}>{streak}x</div>
          </div>
        </div>
        
        <div style={{ width: 60 }} />
      </div>

      {/* TIMER BAR */}
      <div style={{ height: 4, background: "#ffffff08", position: "relative", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${timerPct}%`,
          background: timerColor,
          transition: "width 1s linear, background 0.5s",
          animation: timeLeft <= 5 && !revealed ? "timer-pulse 0.5s infinite" : "none",
        }} />
      </div>

      {/* MAIN GAME AREA */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 20px",
        position: "relative",
        animation: shakeWrong ? "shake 0.6s" : "none",
      }}>
        
        {/* COMBO TEXT */}
        {comboText && (
          <div style={{
            position: "absolute",
            top: 10,
            fontSize: "clamp(20px, 4vw, 32px)",
            fontWeight: 900,
            color: "#FFD700",
            animation: "combo-pop 0.5s ease-out",
            textShadow: "0 0 20px #FFD70080",
            zIndex: 50,
            letterSpacing: 3,
          }}>
            {comboText}
          </div>
        )}

        {/* TIME DISPLAY */}
        {!revealed && (
          <div style={{
            fontSize: 48,
            fontWeight: 900,
            color: timerColor,
            marginBottom: 8,
            fontVariantNumeric: "tabular-nums",
            opacity: timeLeft <= 5 ? undefined : 0.3,
            animation: timeLeft <= 5 ? "timer-pulse 0.5s infinite" : "none",
          }}>
            {timeLeft}
          </div>
        )}

        {/* POKÉMON IMAGE AREA */}
        {currentPokemon && (
          <div style={{
            position: "relative",
            width: "clamp(180px, 50vw, 300px)",
            height: "clamp(180px, 50vw, 300px)",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: revealed
              ? (isCorrect ? "correct-flash 0.8s" : "wrong-flash 0.8s")
              : "silhouette-hover 3s ease-in-out infinite",
            borderRadius: 24,
            background: revealed ? "#ffffff08" : "transparent",
            overflow: "hidden",
          }}>
            {/* Silhouette Mode */}
            {gameMode === "silhouette" && (
              <img
                src={currentPokemon.sprite}
                alt="Who's that Pokémon?"
                onLoad={() => setImageLoaded(true)}
                style={{
                  width: "85%",
                  height: "85%",
                  objectFit: "contain",
                  filter: revealed ? "brightness(1) drop-shadow(0 4px 20px rgba(0,0,0,0.5))" : "brightness(0) drop-shadow(0 0 4px #00000080)",
                  transition: "filter 0.6s ease-out",
                  opacity: imageLoaded ? 1 : 0,
                }}
              />
            )}

            {/* Zoom Mode */}
            {gameMode === "zoom" && (
              <div style={{
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius: 24,
                outline: revealed ? "none" : "3px solid #FFD70040",
                animation: !revealed ? "zoom-pulse 2s infinite" : "none",
              }}>
                <img
                  src={currentPokemon.sprite}
                  alt="Who's that Pokémon?"
                  onLoad={() => setImageLoaded(true)}
                  style={{
                    width: `${revealed ? 100 : zoomLevel * 100}%`,
                    height: `${revealed ? 100 : zoomLevel * 100}%`,
                    objectFit: "contain",
                    objectPosition: revealed ? "center" : `${zoomOffset.x * 100}% ${zoomOffset.y * 100}%`,
                    transition: revealed ? "all 0.6s ease-out" : "none",
                    filter: revealed ? "none" : "contrast(1.2) saturate(0.8)",
                    opacity: imageLoaded ? 1 : 0,
                  }}
                />
              </div>
            )}

            {/* Type Challenge Mode */}
            {gameMode === "type-challenge" && (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}>
                {revealed ? (
                  <img
                    src={currentPokemon.sprite}
                    alt={currentPokemon.name}
                    onLoad={() => setImageLoaded(true)}
                    style={{
                      width: 200, height: 200, objectFit: "contain",
                      animation: "reveal-grow 0.5s ease-out",
                    }}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: 64, marginBottom: 8 }}>❓</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <TypeBadge type={currentPokemon.type1} />
                      {currentPokemon.type2 && <TypeBadge type={currentPokemon.type2} />}
                    </div>
                    <div style={{ color: "#8892b0", fontSize: 14, marginTop: 4 }}>
                      #{String(currentPokemon.id).padStart(4, "0")} &bull; Gen {currentPokemon.gen}
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Loading placeholder */}
            {!imageLoaded && gameMode !== "type-challenge" && (
              <div style={{
                position: "absolute",
                color: "#4a5568",
                fontSize: 14,
              }}>Loading...</div>
            )}
          </div>
        )}

        {/* HINTS */}
        {!revealed && getHintText().length > 0 && (
          <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
            {getHintText().map((hint, i) => (
              <div key={i} style={{
                background: "#FFD70015",
                border: "1px solid #FFD70030",
                borderRadius: 8,
                padding: "6px 16px",
                fontSize: 13,
                color: "#FFD700",
                animation: "hint-slide 0.3s ease-out",
              }}>
                💡 {hint}
              </div>
            ))}
          </div>
        )}

        {/* HINT BUTTON */}
        {!revealed && currentHint < config.hints && (
          <button onClick={useHint} style={{
            background: "transparent",
            border: "1px solid #FFD70040",
            color: "#FFD700",
            padding: "6px 16px",
            borderRadius: 20,
            fontSize: 12,
            cursor: "pointer",
            marginBottom: 12,
            opacity: 0.7,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={e => e.target.style.opacity = "1"}
          onMouseLeave={e => e.target.style.opacity = "0.7"}
          >
            💡 Use Hint ({config.hints - currentHint} left)
          </button>
        )}

        {/* INPUT AREA */}
        {!revealed && difficulty !== "easy" && (
          <form onSubmit={handleSubmitGuess} style={{
            display: "flex",
            gap: 8,
            maxWidth: 360,
            width: "100%",
          }}>
            <input
              ref={inputRef}
              type="text"
              value={guess}
              onChange={e => setGuess(e.target.value)}
              placeholder="Type Pokémon name..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={{
                flex: 1,
                background: "#ffffff10",
                border: "2px solid #ffffff15",
                borderRadius: 12,
                padding: "14px 16px",
                color: "#e2e8f0",
                fontSize: 16,
                fontWeight: 600,
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#FFD70060"}
              onBlur={e => e.target.style.borderColor = "#ffffff15"}
            />
            <button type="submit" style={{
              background: "linear-gradient(135deg, #FFD700, #FF6B35)",
              color: "#1a0a2e",
              border: "none",
              borderRadius: 12,
              padding: "14px 20px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}>
              GO!
            </button>
          </form>
        )}

        {/* MULTIPLE CHOICE (Easy mode) */}
        {!revealed && difficulty === "easy" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            maxWidth: 400,
            width: "100%",
          }}>
            {choices.map(c => (
              <button key={c.id} onClick={() => {
                setRoundHistory(h => [...h, { pokemon: currentPokemon, correct: c.id === currentPokemon.id, time: config.time - timeLeft }]);
                handleReveal(c.id === currentPokemon.id);
              }} style={{
                background: "#ffffff08",
                border: "2px solid #ffffff15",
                borderRadius: 12,
                padding: "14px",
                color: "#ccd6f6",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#FFD700"; e.target.style.background = "#FFD70010"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#ffffff15"; e.target.style.background = "#ffffff08"; }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* REVEALED STATE */}
        {revealed && currentPokemon && (
          <div style={{
            textAlign: "center",
            animation: "result-pop 0.4s ease-out",
          }}>
            <style>{`
              @keyframes result-pop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
            `}</style>
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              color: isCorrect ? "#2A9D8F" : "#E63946",
              letterSpacing: 2,
              marginBottom: 4,
            }}>
              {isCorrect ? "CORRECT!" : "WRONG!"}
            </div>
            <div style={{
              fontSize: "clamp(22px, 5vw, 32px)",
              fontWeight: 900,
              color: "#fff",
              marginBottom: 8,
            }}>
              It's {currentPokemon.name}!
            </div>
            <div style={{
              display: "flex",
              gap: 6,
              justifyContent: "center",
              marginBottom: 4,
            }}>
              <TypeBadge type={currentPokemon.type1} />
              {currentPokemon.type2 && <TypeBadge type={currentPokemon.type2} />}
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 20 }}>
              #{String(currentPokemon.id).padStart(4, "0")} &bull; {generations[currentPokemon.gen]?.region}
            </div>
            <button onClick={handleNext} style={{
              background: "linear-gradient(135deg, #FFD700, #FF6B35)",
              color: "#1a0a2e",
              border: "none",
              padding: "14px 48px",
              borderRadius: 50,
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              letterSpacing: 1,
            }}>
              {round >= totalRounds ? "SEE RESULTS" : "NEXT →"}
            </button>
          </div>
        )}
      </div>

      {/* CAUGHT POKÉMON STRIP */}
      {caught.length > 0 && (
        <div style={{
          padding: "8px 16px",
          background: "#ffffff05",
          borderTop: "1px solid #ffffff08",
          display: "flex",
          alignItems: "center",
          gap: 4,
          overflowX: "auto",
          flexShrink: 0,
        }}>
          <span style={{ color: "#64748b", fontSize: 11, marginRight: 4, whiteSpace: "nowrap" }}>
            CAUGHT:
          </span>
          {caught.map((p, i) => (
            <img
              key={`${p.id}-${i}`}
              src={p.spriteSmall}
              alt={p.name}
              title={p.name}
              style={{
                width: 28,
                height: 28,
                imageRendering: "pixelated",
                opacity: 0.8,
                transition: "transform 0.2s",
                flexShrink: 0,
              }}
              onMouseEnter={e => e.target.style.transform = "scale(1.5)"}
              onMouseLeave={e => e.target.style.transform = "scale(1)"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
