/** Builds the EN / ES / PT listing copy for all four SKUs from one structured source.
 *
 *  Tone, William 2026-08-21: "energy positive peace of mind support", and the copy was over-written.
 *  That matches the 2026-08-03 creative brief already on file, comedy and positive energy and
 *  worry-free days, never fear. The previous draft opened on "drops, loss and theft", which argues
 *  on the buyer's fear and on their ground. Bullets 2-5 are shared; bullet 1 is per SKU.
 *
 *  One source so the three languages cannot drift apart.
 *  RUN: node scripts/build-listing-copy.mjs
 */
import { writeFileSync } from 'node:fs';

const L = {
 EN: {
  shared: [
   ["ONE-HANDED, AND IT DISAPPEARS UNDER A JACKET",
    "The cord retracts on its own and your phone's own weight stops it snapping back, so you draw it out and put it away with one hand. Clipped to a belt loop, pocket, bag or backpack it sits flat and stays out of the way."],
   ["FITS PHONES 171 G AND UNDER, CHECK BEFORE YOU BUY",
    "Made for phones up to 171 g, roughly an iPhone 16. That covers iPhone 15, 16, 16e, Air, 14, 13, 12 and SE, plus Galaxy S25, S24, S23 and S22. Heavier phone? Choose Phone Assured Pro. Full list on this page."],
   ["CLIPS TO WHAT YOU ALREADY CARRY",
    "The carabiner has two ends, so you can loop the cord round a rail, bar, stroller, luggage handle or gym machine and clip it back to itself. Works just as well on earbuds, sunglasses, keys, a wallet or an ID badge."],
   ["A FULL YEAR OF WARRANTY, AND PEOPLE WHO ANSWER",
    "Every Phone Assured is covered for twelve months, with support that actually replies. If anything goes wrong, tell us and we will sort it out. Built to be used every day, not kept in a drawer."]],
  proExtra: ["PRO-GRADE MATERIALS, BUILT TO KEEP UP",
    "A zinc alloy clip and a strong synthetic fiber cord, for people carrying bigger phones, spending more time outdoors, or who simply like knowing the hardware is over-built for the job."],
  open: {
   BLACK: ["HANDS FREE, MIND EASY",
     "Your phone stays with you, so you can enjoy the day instead of patting your pocket. Travelling, shopping, at a concert or walking the dog, Phone Assured keeps it attached and within reach. No adhesive on your case, nothing stuck to your phone."],
   "2-PACK": ["TWO TETHERS, TWO EASY MINDS",
     "One for you and one for whoever always loses theirs. Or keep a spare in the travel bag so the good habit follows you. Two phones covered, one purchase, and the same easy day for both of you."],
   "3-PACK": ["THREE TETHERS, ONE RELAXED HOUSEHOLD",
     "One on the everyday bag, one in the travel bag and one for whoever needs it next. The three-pack is the easy way to cover a family without thinking about it again."],
   PRO: ["BUILT FOR BIGGER PHONES, SAME EASY DAY",
     "Made for the phones most people actually carry. Over 171 g, and that includes iPhone Pro, Plus and Max, Galaxy Plus and Ultra, and essentially the whole current Pixel line. Same freedom, more hardware behind it."]},
  desc: {
   head: "Your phone carries your day. Phone Assured keeps it with you so you can get on and enjoy it.",
   body: "The assisted retractable cord gives you comfortable one-handed access for calls, messages, photos and maps while the phone stays attached. Clip it to a belt loop, pocket, purse, backpack or bag without adding bulk. No adhesive pads on your case and nothing stuck directly to your phone.\n\nWHICH ONE IS RIGHT FOR YOU? Phone Assured Black suits phones up to 171 g, including the iPhone 15, 16 and 17 and the Galaxy S25. For heavier phones, including most Pro, Plus, Max and Ultra models, choose Phone Assured Pro. Check your phone's weight against the compatible models listed on this page.\n\nIt is not only for phones. The dual-ended carabiner also secures earbuds and their case, sunglasses, keys, a wallet or an ID badge, and lets you loop the cord round a rail or handle and clip it back to itself.",
   tail: "Backed by a full one-year warranty and support that answers. Protect your phone, keep your hands free, and enjoy the day."},
  terms: "lanyard strap cord clip chain holder safety security drop secure wrist crossbody iphone galaxy pixel 17 16 15 14 13 12 11 se mini plus max ultra s25 s24 s23 a16 earbuds sunglasses case keys wallet badge tab belt loop protection women"
 },
 ES: {
  shared: [
   ["CON UNA SOLA MANO, Y DESAPARECE BAJO LA CHAMARRA",
    "El cordón se retrae solo y el peso del propio celular evita que regrese de golpe, así que lo sacas y lo guardas con una mano. En la presilla del cinturón, la bolsa o la mochila queda plano y no estorba."],
   ["PARA CELULARES DE 171 G O MENOS, REVISA ANTES DE COMPRAR",
    "Hecho para celulares de hasta 171 g, más o menos un iPhone 16. Incluye iPhone 15, 16, 16e, Air, 14, 13, 12 y SE, además de Galaxy S25, S24, S23 y S22. ¿Tu celular pesa más? Elige Phone Assured Pro. Lista completa en esta página."],
   ["SE ENGANCHA A LO QUE YA TRAES",
    "El mosquetón tiene dos extremos, así que rodeas un barandal, un tubo, una carriola, el asa de una maleta o un aparato del gimnasio y lo enganchas de vuelta sobre su propio cordón. Igual de útil con audífonos, lentes, llaves, cartera o gafete."],
   ["UN AÑO COMPLETO DE GARANTÍA, Y GENTE QUE CONTESTA",
    "Cada Phone Assured está cubierto doce meses, con atención al cliente que sí responde. Si algo sale mal, nos escribes y lo resolvemos. Hecho para usarse todos los días, no para guardarse en un cajón."]],
  proExtra: ["MATERIALES DE GRADO PROFESIONAL, PARA SEGUIRTE EL PASO",
    "Mosquetón de aleación de zinc y cordón de fibra sintética resistente, para quien carga celulares grandes, pasa más tiempo al aire libre, o simplemente prefiere saber que el herraje sobra para la tarea."],
  open: {
   BLACK: ["MANOS LIBRES, MENTE TRANQUILA",
     "Tu celular se queda contigo, así que disfrutas el día en lugar de andar revisando la bolsa. De viaje, de compras, en un concierto o paseando al perro, Phone Assured lo mantiene sujeto y a la mano. Sin pegamento en la funda y sin nada adherido al celular."],
   "2-PACK": ["DOS CORDONES, DOS MENTES TRANQUILAS",
     "Uno para ti y otro para quien siempre pierde el suyo. O deja uno de repuesto en la maleta para que la buena costumbre te siga. Dos celulares cubiertos, una sola compra, y el mismo día tranquilo para los dos."],
   "3-PACK": ["TRES CORDONES, UNA CASA RELAJADA",
     "Uno en la mochila de diario, otro en la maleta de viaje y el tercero para quien lo necesite después. El paquete de 3 es la forma fácil de cubrir a la familia y no volver a pensarlo."],
   PRO: ["HECHO PARA CELULARES GRANDES, EL MISMO DÍA TRANQUILO",
     "Para los celulares que la gente realmente carga. Más de 171 g, e incluye iPhone Pro, Plus y Max, Galaxy Plus y Ultra, y prácticamente toda la línea Pixel actual. La misma libertad, con más herraje detrás."]},
  desc: {
   head: "Tu celular carga tu día. Phone Assured lo mantiene contigo para que puedas disfrutarlo.",
   body: "El cordón retráctil asistido te da acceso cómodo con una sola mano para llamadas, mensajes, fotos y mapas, mientras el celular sigue sujeto. Engánchalo a la presilla del cinturón, la bolsa del pantalón, el bolso o la mochila sin que abulte. Sin pegamento en la funda y sin nada adherido directamente al celular.\n\n¿CUÁL ES EL TUYO? Phone Assured Black es para celulares de hasta 171 g, incluidos iPhone 15, 16 y 17 y Galaxy S25. Para celulares más pesados, incluidos la mayoría de los modelos Pro, Plus, Max y Ultra, elige Phone Assured Pro. Compara el peso de tu celular con la lista de modelos compatibles de esta página.\n\nNo es solo para celulares. El mosquetón de dos extremos también asegura audífonos y su estuche, lentes, llaves, cartera o gafete, y te deja rodear un barandal o un asa y engancharlo sobre su propio cordón.",
   tail: "Respaldado por un año completo de garantía y atención que sí contesta. Cuida tu celular, trae las manos libres y disfruta el día."},
  terms: "cordon celular correa antirrobo cable retractil sujetador agarradera llavero seguridad anticaida caida viaje muneca mano cuello funda audifonos lentes llaves cartera gafete credencial iphone galaxy pixel"
 },
 PT: {
  shared: [
   ["COM UMA MÃO SÓ, E SOME DEBAIXO DA JAQUETA",
    "O cordão recolhe sozinho e o peso do próprio celular impede que ele volte de repente, então você tira e guarda com uma mão só. Na presilha do cinto, no bolso ou na mochila fica plano e não atrapalha."],
   ["PARA CELULARES DE ATÉ 171 G, CONFIRA ANTES DE COMPRAR",
    "Feito para celulares de até 171 g, mais ou menos um iPhone 16. Inclui iPhone 15, 16, 16e, Air, 14, 13, 12 e SE, além dos Galaxy S25, S24, S23 e S22. Celular mais pesado? Escolha o Phone Assured Pro. Lista completa nesta página."],
   ["PRENDE NO QUE VOCÊ JÁ CARREGA",
    "O mosquetão tem duas pontas, então você contorna um corrimão, uma barra, um carrinho de bebê, a alça de uma mala ou um aparelho de academia e prende de volta no próprio cordão. Funciona igual com fones de ouvido, óculos, chaves, carteira ou crachá."],
   ["UM ANO COMPLETO DE GARANTIA, E GENTE QUE RESPONDE",
    "Cada Phone Assured tem doze meses de cobertura, com atendimento que realmente responde. Se algo der errado, é só falar com a gente. Feito para usar todo dia, não para ficar na gaveta."]],
  proExtra: ["MATERIAIS DE NÍVEL PROFISSIONAL, PARA ACOMPANHAR O RITMO",
    "Mosquetão em liga de zinco e cordão de fibra sintética resistente, para quem carrega celulares maiores, passa mais tempo ao ar livre, ou simplesmente gosta de saber que o material sobra para a tarefa."],
  open: {
   BLACK: ["MÃOS LIVRES, CABEÇA TRANQUILA",
     "Seu celular fica com você, então dá para aproveitar o dia em vez de ficar conferindo o bolso. Em viagem, nas compras, num show ou passeando com o cachorro, o Phone Assured mantém tudo preso e ao alcance. Sem adesivo na capa e sem nada colado no aparelho."],
   "2-PACK": ["DOIS CORDÕES, DUAS CABEÇAS TRANQUILAS",
     "Um para você e outro para quem vive perdendo o dele. Ou deixe um reserva na mala de viagem para o bom hábito te acompanhar. Dois celulares cobertos, uma compra só, e o mesmo dia tranquilo para os dois."],
   "3-PACK": ["TRÊS CORDÕES, UMA CASA TRANQUILA",
     "Um na mochila do dia a dia, outro na mala de viagem e o terceiro para quem precisar depois. O kit com 3 é o jeito fácil de cobrir a família e não pensar mais nisso."],
   PRO: ["FEITO PARA CELULARES MAIORES, O MESMO DIA TRANQUILO",
     "Para os celulares que as pessoas realmente carregam. Acima de 171 g, e isso inclui iPhone Pro, Plus e Max, Galaxy Plus e Ultra, e praticamente toda a linha Pixel atual. A mesma liberdade, com mais material atrás."]},
  desc: {
   head: "Seu celular carrega o seu dia. O Phone Assured mantém ele com você para que dê para aproveitar.",
   body: "O cordão retrátil assistido dá acesso confortável com uma mão só para ligações, mensagens, fotos e mapas, enquanto o aparelho continua preso. Prenda na presilha do cinto, no bolso, na bolsa ou na mochila sem aumentar o volume. Sem adesivo na capa e sem nada colado diretamente no celular.\n\nQUAL É O SEU? O Phone Assured Black é para celulares de até 171 g, incluindo iPhone 15, 16 e 17 e Galaxy S25. Para celulares mais pesados, incluindo a maioria dos modelos Pro, Plus, Max e Ultra, escolha o Phone Assured Pro. Compare o peso do seu celular com a lista de modelos compatíveis desta página.\n\nNão é só para celular. O mosquetão de duas pontas também prende fones de ouvido e o estojo, óculos, chaves, carteira ou crachá, e deixa você contornar um corrimão ou uma alça e prender no próprio cordão.",
   tail: "Com um ano completo de garantia e atendimento que responde. Cuide do seu celular, fique de mãos livres e aproveite o dia."},
  terms: "cordao celular corda antifurto cabo retratil alca presilha chaveiro seguranca antiqueda queda viagem pulso mao pescoco capa fones ouvido oculos chaves carteira cracha iphone galaxy pixel"
 }
};

const SKUS=['BLACK','2-PACK','3-PACK','PRO'];
for(const [lang,src] of Object.entries(L)){
  const out={};
  for(const sku of SKUS){
    const bullets=[{headline:src.open[sku][0], body:src.open[sku][1]}];
    if(sku==='PRO') bullets.push({headline:src.proExtra[0], body:src.proExtra[1]});
    for(const [h,b] of src.shared){
      if(sku==='PRO' && /171/.test(h)) continue;      // the Pro says the opposite, it is in bullet 1
      bullets.push({headline:h, body:b});
    }
    out[sku]={
      bullets: bullets.slice(0,5),
      description: `${src.desc.head}\n\n${src.open[sku][1]}\n\n${src.desc.body}\n\n${src.desc.tail}`,
      search_terms: src.terms,
    };
  }
  const f=`confabulator/listing-build/${{EN:'en',ES:'mx-es',PT:'br-pt'}[lang]}-copy.json`;
  writeFileSync(f, JSON.stringify(out,null,1));
  console.log(`\n=== ${lang} -> ${f}`);
  for(const [k,v] of Object.entries(out)){
    const longest=Math.max(...v.bullets.map(b=>(b.headline+': '+b.body).length));
    console.log(`  ${k.padEnd(7)} bullets ${v.bullets.length}  longest ${longest}${longest>500?' OVER 500':''}  desc ${v.description.length}  terms ${Buffer.byteLength(v.search_terms)}b${Buffer.byteLength(v.search_terms)>250?' OVER 250':''}`);
  }
}
