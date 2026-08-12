/** reviews.mjs — REAL reviews, read off the live listings 2026-08-12 (B07Y5GZP1T, B097MGPCPC,
 *  B0BLLJLSDP). Verbatim, including the reviewers' own spelling.
 *
 *  Nothing here is generated, paraphrased or composited from several reviews. Amazon prohibits
 *  review quotes inside A+ content, so these are for SOCIAL and the detail-page video only.
 *
 *  `photo` is the PAIRED source image and it is not decoration. William, 2026-08-11:
 *  "if someone reviewed jeans, don't show a picture of someone in khaki slacks. Show someone
 *  wearing jeans. The goal is to match the photo to the review." Every pairing below is answerable:
 *  the reviewer named a place on the body or a situation, and the photo shows that place or that
 *  situation. Where our library cannot answer a review honestly, the review carries `photo: null`
 *  and does not get a card.
 *
 *  GENDER RULE (William, 2026-08-12): "Kevin is a guy's name typically. So we just need to align."
 *  Kevin and Jarret Dodge are men and both got women on their cards. `who` records the reviewer's
 *  gender where the NAME makes it plain, and `shows` records who is in the photograph. The builder
 *  REFUSES a card where the two disagree. Handles that carry no gender (meda48, MJ, CA in CA) are
 *  'x' and match anyone, because guessing from a handle is how you get this wrong in the other
 *  direction.
 *
 *  ONE FACE, ONE NAME (William, 2026-08-12): "you can't use two different guys' names and then the
 *  same person is in the photos... If you use them for one name, keep them for that name."
 *  `model` is a stable identity for whoever is recognisable in the frame, INCLUDING hands: the same
 *  wrist and bracelets read as the same person. The builder REFUSES if one model appears under two
 *  reviewer names.
 *
 *  This bites hard, and that is the point. We own exactly TWO distinguishable men and THREE women
 *  across the entire library, so most reviews cannot be given a face honestly. Those carry
 *  `photo: null` and a `hold` note saying which frame they want and who has it. Six true cards
 *  beat fourteen where one man is four different customers.
 *
 *  HARD CONSTRAINT on every image choice (from our own 1-star reviews, not from theory).
 *  Stevo, Nov 2022: "They show a phone hanging from this lanyard about knee high but actually he
 *  must be holding the line." Dean Creech, Mar 2026: "they never show the clip fully supporting the
 *  weight of the phone. But, they are close enough... that it gave me that impression."
 *  Never choose a frame where the phone appears suspended by the cord. A hand is always holding it.
 */
const F = 'assets/source/_faces';
const L = 'assets/source/_lifestyle';

export const REVIEWS = [
  { id:'adam3914', model:'cozumel-arm', name:'adam3914', stars:5, date:'December 2024', asin:'B07Y5GZP1T', typo:true, who:'m', shows:'m',
    quote:'The spring is strong enough to slow the decent but not so strong it makes holding the phone annoying.',
    theme:'the soft spring, defended by a customer',
    photo:`${L}/_Phone_Assured_Photos_Cozumel_April_9th__IMG_20210409_131507.jpg`,
    why:'he is talking about the feel of the spring while HOLDING the phone; the frame is a hand holding the phone out, cord slack' },

  { id:'kevin', model:'bcn-man', name:'Kevin', stars:5, date:'February 2026', asin:'B07Y5GZP1T', who:'m', shows:'m',
    quote:'Long enough cord that allows you to use your phone while it’s still clipped to your jeans, but doesn’t allow your phone to crash to the ground if you drop it.',
    theme:'length and the catch',
    photo:`${F}/os_Megan_William_Barcelona__Mabel_Llevat_57.jpg`,
    why:'KEVIN IS A MAN and the 08-12 card put a woman on it. This is our male model with his arm '
      + 'extended and the cord running from his hip to the phone, which is the actual claim: length. '
      + 'Honest gap: he says jeans and these are not jeans. We own no frame of a man with the clip '
      + 'on denim. Gender first, because that was the error William named' },

  { id:'meda48', model:'dec-woman', name:'meda48', stars:5, date:'February 2026', asin:'B07Y5GZP1T', who:'x', shows:'f',
    quote:'A really handy device to ensure that I don’t lose my cell phone if it falls out of my pocket. I also use it on my purse sometimes.',
    theme:'pocket and bag',
    photo:`${F}/hone_Assured_Photos_Dec_10__IMG_20201210_153115.jpg`,
    why:'she names the purse; this is the shoulder bag with the phone in hand' },

  { id:'prescillia', model:'oax-hands', name:'Prescillia01', stars:5, date:'February 2026', asin:'B07Y5GZP1T', who:'f', shows:'x',
    quote:'I have it for when my kids are playing with my phone and I don’t want them to be constantly dropping it.',
    theme:'kids',
    photo:null,   // HELD 2026-08-12
    hold:'oax-hands belongs to MJ, whose drop story suits a hand on a phone better.',
    wantedPhoto:'${F}/hotos_Megan_Lindsay_Oaxaca__A7_08249.jpg',
    why:'we own no photographs of children, so this is the closest honest frame: a phone being handled, held' },

  { id:'eddie-d', model:'bcn-man', name:'Eddie D', stars:5, date:'July 2024', asin:'B097MGPCPC', who:'m', shows:'m',
    quote:'Someone tried stealing my phone at a rave and when they tried grabbing my phone it was attached to this Phone tether!! This is a necessity when you are in large crowds.',
    theme:'the anti-theft save, told by the person it happened to',
    photo:null,   // HELD 2026-08-12
    hold:'bcn-man belongs to Kevin. We own two distinguishable men and Kevin needs one.',
    wantedPhoto:'${F}/os_Megan_William_Barcelona__Mabel_Llevat_167.jpg',
    why:'EDDIE IS A MAN. We own NO crowd or night-venue photography, so rather than dress a quiet '
      + 'daytime street up as a rave, the frame shows the thing his story turns on: a man out in '
      + 'public with the phone in hand and the cord attached to him' },

  { id:'ca-in-ca', model:'oax-blonde', name:'CA in CA', stars:5, date:'March 2024', asin:'B097MGPCPC', who:'x', shows:'f',
    quote:'Would definitely recommend for traveling. I keep my phone in my back pocket...not always the best place for it, especially when using the restroom. This keeps it nice and secure so you’re not likely to leave it laying somewhere.',
    theme:'back pocket, travel',
    photo:`${F}/hotos_Megan_Lindsay_Oaxaca__A7_08242.jpg`,
    why:'she names the BACK POCKET; this frame is the back pocket of a pair of jeans, clip on the waistband' },

  { id:'jarret-dodge', model:'bcn-man', name:'Jarret Dodge', stars:5, date:'June 2023', asin:'B097MGPCPC', who:'m', shows:'m',
    quote:'I loved the ease and durability of the phone tether. I actually bought two! It is perfect for festivals and concerts- would and have recommended to multiple friends!',
    theme:'bought two, recommends to friends',
    photo:null,   // HELD 2026-08-12
    hold:'bcn-man belongs to Kevin. No second male face available.',
    wantedPhoto:'${F}/os_Megan_William_Barcelona__Mabel_Llevat_70.jpg',
    why:'JARRET IS A MAN and the 08-12 card put a woman on it. Male model, phone up, out among the '
      + 'architecture with the cord running down to his hip. No festival photography exists, so this '
      + 'is honest adjacent rather than a claimed venue' },

  { id:'mj', model:'oax-hands', name:'MJ', stars:5, date:'August 2024', asin:'B0BLLJLSDP', who:'x', shows:'x',
    quote:'I’m always dropping my phone and this phone leash has been a game changer! Better than I expected and it works as intended!',
    theme:'the clumsy customer',
    photo:`${F}/hotos_Megan_Lindsay_Oaxaca__A7_08251.jpg`,
    why:'the hand and the tab, the moment a drop would start' },

  { id:'courtney', model:'oax-blonde', name:'Courtney Robinson', stars:5, date:'March 2025', asin:'B0BLLJLSDP', who:'f', shows:'f',
    quote:'This product is super strong! I used when traveling and it held my phone fine. I use it also at work to keep my keys on me.',
    theme:'travel and work',
    photo:null,   // HELD 2026-08-12
    hold:'oax-blonde belongs to CA in CA, whose review names the back pocket and matches that frame exactly.',
    wantedPhoto:'${F}/hotos_Megan_Lindsay_Oaxaca__A7_08210.jpg',
    why:'travelling, daylight, phone in hand at the hip' },

  { id:'ralisa', model:'dec-woman', name:'Ralisa Watson', stars:5, date:'March 2025', asin:'B0BLLJLSDP', typo:true, who:'f', shows:'f',
    quote:'My sister loves it as she no longer fears losing her phone due to theft.',
    theme:'theft fear, removed',
    photo:null,   // HELD 2026-08-12
    hold:'dec-woman belongs to meda48, whose review names the purse and matches that frame exactly.',
    wantedPhoto:'${F}/hone_Assured_Photos_Dec_10__IMG_20201210_151837.jpg',
    why:'a whole person out in a public street, which is where that fear lives. The earlier pick '
      + 'was cropped above the shoulders in the source and read as a cut-off head' },

  { id:'treasure', model:'dec-woman', name:'Treasure', stars:4, date:'November 2024', asin:'B07Y5GZP1T', who:'x', shows:'f',
    quote:'Overall, I like this product it is just what we needed for a teen who constantly misplaces his phone.',
    theme:'bought for a teenager',
    photo:null,   // HELD 2026-08-12
    hold:'dec-woman belongs to meda48.',
    wantedPhoto:'${F}/hone_Assured_Photos_Dec_10__IMG_20201210_151519.jpg',
    why:'young, casual, phone in hand',
    note:'4 stars. The rest of her review asks for a longer line. Quoted sentence stands alone and is not the complaint.' },

  { id:'david-guzman', model:'bcn-man', name:'David Guzman', stars:5, date:'April 2026', asin:'B097MGPCPC', who:'m', shows:'m',
    quote:'Best way to secure an iPhone or iPad. Perfect.',
    theme:'short and total',
    photo:null,   // HELD 2026-08-12
    hold:'bcn-man belongs to Kevin. His note, a phone rather than the bare clip, is answered above and waits on a second male model.',
    wantedPhoto:'${F}/os_Megan_William_Barcelona__Mabel_Llevat_66.jpg',
    why:'William 2026-08-12: "it should be a phone, not the actual clip in his hand with the string." '
      + 'He is talking about securing an iPhone, so the frame is a phone in a man\'s hands with the '
      + 'tether attached. The old pick showed the bare hardware and none of the thing he bought it for' },

  { id:'amazon-ca-purse', model:'dec-woman', name:'Amazon Customer', stars:5, date:'October 2025', asin:'B0BLLJLSDP', who:'x', shows:'f',
    quote:'I actually use this with my purse because I have a bad habit of setting it down in stores when shopping and getting preoccupied and walking away. I just secure it to purse strap and attach to wristlet. Works great and no more panic!!',
    theme:'the bag, not the phone',
    photo:null,   // HELD 2026-08-12
    hold:'dec-woman belongs to meda48. Both reviews are about a bag and only one can have her.',
    wantedPhoto:'${F}/hone_Assured_Photos_Dec_10__IMG_20201210_153311.jpg',
    why:'she names the purse strap; this is the bag on the shoulder with the whole person in frame. '
      + 'The earlier pick was cropped above the shoulders in the source',
    note:'Reviewed in Canada. Emoji removed, nothing else changed.' },

  { id:'george-cameron', model:'car-man', name:'George Cameron', stars:4, date:'February 2025', asin:'B0BLLJLSDP', who:'m', shows:'m',
    quote:'It’s a nice gift to buy for someone who works on the outside. I can confidently hold my phone now without having to be worrying about it getting lost or dropped overboard while at work.',
    theme:'working outdoors',
    photo:`${L}/_Phone_Assured_Photos_Jan_10th__IMG_3290.jpg`,
    why:'getting out of a vehicle, phone on the hip, a working day',
    note:'4 stars. His caution about heavy phones is real and is NOT quoted here; it belongs to the weight-class message, not a testimonial.' },

  /* ── HELD BACK ON PURPOSE ─────────────────────────────────────────────────────────────── */
  { id:'noreen', name:'Noreen Williams', stars:3, date:'February 2026', asin:'B07Y5GZP1T',
    quote:'I’ve found it works much better for ID badges, Bluetooth headphone cases and small keychains.',
    theme:'NOT FOR USE — the badge-holder problem, kept here as evidence only', photo:null },

  { id:'mohit-warranty', name:'MOHIT GOEL', stars:2, date:'February 2026', asin:'B0BLLJLSDP',
    quote:'For USA, where the products has 1 year warranty, the company is very helpful and holds thier end of bargain. So, recommend if warranty is considered.',
    theme:'NOT FOR USE without William — a genuine warranty endorsement inside a 2-star review. ' +
          'Quoting the warm half of a cold review is the kind of cherry-pick the FTC names. His call.',
    photo:null },
];

/** The ones that actually get built: a real photo, and a real reason for that photo. */
export const CARDABLE = REVIEWS.filter(r => r.photo);

/** Enforce the gender rule at IMPORT time, so a mismatch cannot reach a render. 'x' is unknown on
 *  either side and matches anything; only a stated m-vs-f disagreement is an error. */
const clash = CARDABLE.filter(r => r.who && r.shows && r.who !== 'x' && r.shows !== 'x' && r.who !== r.shows);
if (clash.length) throw new Error(
  'GENDER MISMATCH between reviewer and photo, refusing to build:\n' +
  clash.map(r => `   ${r.name} is '${r.who}' but the photo shows '${r.shows}'  (${r.id})`).join('\n'));

/** One recognisable person stands for exactly ONE reviewer. Hands count: same wrist, same person. */
const byModel = {};
for (const r of CARDABLE) if (r.model) (byModel[r.model] ||= []).push(r.name);
const reused = Object.entries(byModel).filter(([, n]) => n.length > 1);
if (reused.length) throw new Error(
  'ONE FACE USED FOR SEVERAL NAMES, refusing to build:\n' +
  reused.map(([m, n]) => `   ${m} appears as ${n.join(', ')}`).join('\n'));

/** Reviews we cannot photograph honestly yet. Kept visible so the gap is a number, not a silence. */
export const HELD = REVIEWS.filter(r => r.hold);
