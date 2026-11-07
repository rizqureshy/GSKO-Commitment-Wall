/* Annual Connect — local data adapter (SAMPLE DATA).
   Every person, name and commitment here is fictional and generated deterministically from a seed.
   The adapter exposes the same shape a production adapter will: { list(), subscribe(fn), add(contribution) }.
   Swap this file for a network adapter later without touching layout, sequencing or rendering. */
window.AC = window.AC || {};
(function (AC) {
  'use strict';

  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  const THEMES = [
    { id: 'collaboration', label: 'Collaboration' },
    { id: 'customers',     label: 'Customers' },
    { id: 'learning',      label: 'Learning' },
    { id: 'execution',     label: 'Execution' },
    { id: 'colleagues',    label: 'Supporting colleagues' },
    { id: 'listening',     label: 'Listening' }
  ];

  const COMMITMENTS = {
    collaboration: [
      'I will make it easier for people outside my team to work with us.',
      'I will share what I am working on before it is finished, so others can shape it.',
      'I will bring one person from another function into every planning conversation.',
      'I will replace one status meeting a week with a working session.',
      'I will write things down so the next person does not have to ask.',
      'I will say yes to the first cross-team request that lands on my desk each month.',
      'I will stop protecting my roadmap and start protecting our outcome.',
      'I will introduce two colleagues who should already know each other, every week.',
      'I will open my team\'s retrospectives to anyone who wants to sit in.',
      'I will ask what another team needs from us before I tell them what we need from them.',
      'I will credit the people whose work I build on, by name, every time.',
      'I will hand over my projects with a page, a walkthrough and a phone number.',
      'I will co-own one goal with a team I have never worked with.',
      'I will make our dashboards readable by someone outside engineering.',
      'I will answer the question people are afraid to ask in the meeting.'
    ],
    customers: [
      'I will turn customer feedback into action within the same week it arrives.',
      'I will spend one day a quarter sitting with a customer, not presenting to them.',
      'I will say the price first and explain the value second.',
      'I will stop sending decks to people who asked for a conversation.',
      'I will bring one customer\'s voice, in their own words, into every internal review.',
      'I will call back the customer who left, and ask what we missed.',
      'I will ask what happens if they do nothing, in every first meeting.',
      'I will send the follow-up before I reach the car park.',
      'I will know my customers\' customers by name.',
      'I will walk a customer through a data centre before I walk them through a contract.',
      'I will close every quarter with at least one customer who would recommend us unprompted.',
      'I will treat a complaint as the most useful message I receive that day.',
      'I will fix the small thing a customer mentioned in passing.',
      'I will never let a renewal be the first time we talk that year.',
      'I will measure my week by problems solved for customers, not by meetings held.'
    ],
    learning: [
      'I will learn the partner\'s product better than they know ours.',
      'I will spend an hour a week learning something I cannot yet explain.',
      'I will ask a junior colleague to teach me one thing every month.',
      'I will read the engineering notes before I present the engineering story.',
      'I will shadow a solutions engineer once a month and take notes like a student.',
      'I will finish the certification I have been starting for two years.',
      'I will run a post-mortem on my own decisions, not only on incidents.',
      'I will teach my team one thing a week and learn two from them.',
      'I will study the deal we lost more carefully than the deal we won.',
      'I will learn enough of a second language to greet our colleagues in Singapore properly.',
      'I will keep a list of the questions I could not answer, and answer them.',
      'I will sit in on a customer support shift every quarter.',
      'I will admit when I do not know, and go and find out.',
      'I will write up what I learn so it outlives the project.',
      'I will replace one opinion a month with evidence.'
    ],
    execution: [
      'I will finish what I start before I start what is next.',
      'I will forecast on evidence, never on hope.',
      'I will leave every room with a next step, an owner and a date.',
      'I will make every executive summary fit on one page.',
      'I will cut one recurring meeting and give the hour back.',
      'I will retire the sixty-slide deck for good.',
      'I will decide within a day on anything that is reversible.',
      'I will book 2027 before 2026 is over.',
      'I will take the hardest conversation first, every morning.',
      'I will close the deal that everyone said was dead.',
      'I will stop saying soon and start saying when.',
      'I will keep my commitments small enough to keep.',
      'I will measure the outcome, not the activity.',
      'I will deliver the boring thing on time, every time.',
      'I will bring one new logo to every quarterly review.'
    ],
    colleagues: [
      'I will create room for others to contribute before I fill the silence.',
      'I will notice who has not spoken, and ask them.',
      'I will give feedback within a day, in private, and in person.',
      'I will sponsor one colleague for an opportunity I would have taken myself.',
      'I will protect my team\'s evenings as fiercely as I protect the forecast.',
      'I will say thank you specifically, not generally.',
      'I will check in on the quiet ones, not only the loud ones.',
      'I will stay out of the way of people who are doing it better than I would.',
      'I will mentor someone who does not look like me or think like me.',
      'I will celebrate a colleague\'s win in front of their manager.',
      'I will make the new joiner\'s first month the best month I can.',
      'I will carry the hard news myself instead of forwarding it.',
      'I will ask for help earlier, so others feel they can too.',
      'I will take my holiday, so my team takes theirs.',
      'I will leave people better than I found them.'
    ],
    listening: [
      'I will listen with intention, not while waiting to speak.',
      'I will ask one more question before I give an answer.',
      'I will repeat back what I heard before I respond to it.',
      'I will put the phone face down in every conversation.',
      'I will hear the objection fully before I handle it.',
      'I will ask my team what I should stop doing, and stop.',
      'I will listen to the customer who is not buying yet.',
      'I will let silence do some of the work.',
      'I will take the feedback I disagree with seriously for a week before I decide.',
      'I will ask how, not just what, when someone brings me a result.',
      'I will read the whole message before I reply to the first line.',
      'I will hold one meeting a month where I only listen.',
      'I will notice what is not being said.',
      'I will give the quiet idea the same airtime as the loud one.',
      'I will assume the other person knows something I do not.'
    ]
  };


  // Short excerpts for labels in the collective view, written by hand so nothing is truncated mid-thought.
  // Same order as COMMITMENTS. Full wording is never altered; excerpts are labels only.
  const EXCERPTS = {
    collaboration: ['Make collaboration easier','Share work before it is finished','Bring another function in','Work sessions, not status','Write it down','Say yes across teams','Protect the outcome','Introduce two colleagues a week','Open our retrospectives','Ask what they need first','Credit people by name','Hand over properly','Co-own a goal','Dashboards anyone can read','Ask the unasked question'],
    customers: ['Turn feedback into action','Sit with a customer','Say the price first','Conversations, not decks','Bring the customer\'s voice','Call back who left','Ask what if nothing changes','Follow up before the car park','Know their customers','Data centre before contract','Be recommended unprompted','Welcome the complaint','Fix the small thing','Talk before the renewal','Measure by problems solved'],
    learning: ['Learn the partner\'s product','An hour of learning a week','Be taught by a junior','Read the engineering notes','Shadow an engineer','Finish the certification','Review my own decisions','Teach one, learn two','Study the lost deal','Greet Singapore properly','Answer my open questions','Take a support shift','Admit what I don\'t know','Write up what I learn','Replace opinion with evidence'],
    execution: ['Finish before starting','Forecast on evidence','Leave with a next step','One-page summaries','Give the hour back','Retire the long deck','Decide within a day','Book 2027 early','Hardest conversation first','Close the dead deal','Say when, not soon','Keep commitments small','Measure the outcome','Boring things on time','One new logo a quarter'],
    colleagues: ['Create room for others','Ask who hasn\'t spoken','Feedback within a day','Sponsor someone else','Protect their evenings','Thank people specifically','Check on the quiet ones','Stay out of the way','Mentor someone unlike me','Celebrate in front of managers','A great first month','Carry the hard news','Ask for help earlier','Take my holiday','Leave people better'],
    listening: ['Listen with intention','One more question','Repeat back what I heard','Phone face down','Hear the whole objection','Ask what to stop','Listen before they buy','Let silence work','Sit with the feedback','Ask how, not just what','Read the whole message','One meeting to only listen','Notice the unsaid','Airtime for the quiet idea','Assume they know something']
  };

  // Equinix metros, approximate coordinates, illustrative only until an internal list replaces them.
  const METROS = [
    ['Ashburn',39.0,-77.5],['New York',40.7,-74.0],['Chicago',41.9,-87.6],['Dallas',32.8,-96.8],['Silicon Valley',37.4,-122.0],['Los Angeles',34.0,-118.2],['Seattle',47.6,-122.3],['Toronto',43.7,-79.4],['Miami',25.8,-80.2],['Atlanta',33.7,-84.4],['Denver',39.7,-105.0],
    ['São Paulo',-23.5,-46.6],['Rio de Janeiro',-22.9,-43.2],['Bogotá',4.7,-74.1],['Mexico City',19.4,-99.1],
    ['London',51.5,-0.1],['Amsterdam',52.4,4.9],['Frankfurt',50.1,8.7],['Paris',48.9,2.3],['Madrid',40.4,-3.7],['Milan',45.5,9.2],['Zurich',47.4,8.5],['Stockholm',59.3,18.1],['Helsinki',60.2,24.9],['Dublin',53.3,-6.3],['Warsaw',52.2,21.0],['Lisbon',38.7,-9.1],['Istanbul',41.0,28.9],
    ['Dubai',25.2,55.3],['Abu Dhabi',24.5,54.4],['Muscat',23.6,58.4],['Johannesburg',-26.2,28.0],['Lagos',6.5,3.4],
    ['Mumbai',19.1,72.9],['Chennai',13.1,80.3],['Singapore',1.3,103.8],['Kuala Lumpur',3.1,101.7],['Jakarta',-6.2,106.8],['Hong Kong',22.3,114.2],['Shanghai',31.2,121.5],['Tokyo',35.7,139.7],['Osaka',34.7,135.5],['Seoul',37.6,127.0],['Manila',14.6,121.0],['Sydney',-33.9,151.2],['Melbourne',-37.8,145.0],['Perth',-31.9,115.9]
  ].map(([name, lat, lon]) => ({ name, lat, lon }));

  const FIRST = ['Maya','Daniel','Priya','Tomás','Aisha','Noah','Mei','Lukas','Fatima','Jonas','Sofia','Kwame','Hanna','Rafael','Yuki','Amara','Elias','Ingrid','Omar','Leila','Mateo','Chioma','Arjun','Nadia','Felix','Zara','Ibrahim','Clara','Ravi','Esme','Kenji','Lucía','Samuel','Anya','Tariq','Greta','Diego','Imani','Oskar','Ha-eun','Bruno','Selin','Idris','Marta','Jin','Rosa','Emeka','Freya','Hugo','Naomi','Adebayo','Elin','Mohammed','Ines','Kai','Beatriz','Yusuf','Sigrid','Andrés','Wren'];
  const LAST = ['Chen','Reyes','Okafor','Lindqvist','Haddad','Fischer','Nakamura','Adeyemi','Rossi','Kowalski','Rahman','Park','Marín','Berg','Ito','Demir','Novak','Mensah','Silva','Andersson','Khan','Moreau','Tanaka','Dubois','Kim','Varga','Abebe','Costa','Nguyen','Bauer','Osei','Jensen','Sato','Ferreira','Hussain','Laurent','Petrov','Ahmed','Larsen','Mwangi','Schneider','Yilmaz','Oliveira','Shah','Weber','Santos','Diallo','Romano','Kaur','Olsen'];

  function makeSample(count, seed){
    const rng = mulberry32(seed || 2027);
    const out = [];
    const usedNames = new Set();
    const perTheme = {}; THEMES.forEach(t => perTheme[t.id] = 0);
    const base = Date.now() - 1000*60*60*9; // arrivals spread over the last nine hours
    for (let i = 0; i < count; i++){
      let name;
      do { name = FIRST[Math.floor(rng()*FIRST.length)] + ' ' + LAST[Math.floor(rng()*LAST.length)]; } while (usedNames.has(name) && usedNames.size < FIRST.length*LAST.length*0.6);
      usedNames.add(name);
      const theme = THEMES[Math.floor(rng()*THEMES.length)];
      const list = COMMITMENTS[theme.id];
      const ti = (perTheme[theme.id]++ + Math.floor(rng()*3)) % list.length; const text = list[ti]; const ex = EXCERPTS[theme.id][ti];
      const id = 'c' + (1000 + i).toString(36) + '-' + hashStr(name + text).toString(36).slice(0, 4);
      const hasPortrait = rng() < 0.78;
      out.push({
        id, displayName: name, commitment: text, excerpt: ex, themeIds: [theme.id], metro: METROS[Math.floor(rng()*METROS.length)].name,
        portrait: hasPortrait ? { pool: Math.floor(rng()*1e6) } : null,   // resolved against the demo pool by the app
        submittedAt: base + Math.floor(rng()*1000*60*60*9),
        eligible: true
      });
    }
    out.sort((a, b) => a.submittedAt - b.submittedAt);
    return out;
  }

  function createLocalAdapter(opts){
    const count = (opts && opts.count != null) ? opts.count : 300;
    let items = makeSample(count, (opts && opts.seed) || 2027);
    const subs = new Set();
    let serial = 0;
    const rng = mulberry32(99 + count);
    return {
      kind: 'local-sample',
      themes: THEMES,
      list(){ return items.slice(); },
      subscribe(fn){ subs.add(fn); return () => subs.delete(fn); },
      /* Simulated arrival. Not a connected submission system. */
      simulateArrival(){
        const theme = THEMES[Math.floor(rng()*THEMES.length)];
        const list = COMMITMENTS[theme.id];
        const name = FIRST[Math.floor(rng()*FIRST.length)] + ' ' + LAST[Math.floor(rng()*LAST.length)];
        const ti = Math.floor(rng()*list.length); const text = list[ti];
        const c = { id: 'new' + (++serial).toString(36) + '-' + hashStr(name + Date.now()).toString(36).slice(0, 4), displayName: name, commitment: text, excerpt: EXCERPTS[theme.id][ti], themeIds: [theme.id], metro: METROS[Math.floor(rng()*METROS.length)].name, portrait: rng() < 0.8 ? { pool: Math.floor(rng()*1e6) } : null, submittedAt: Date.now(), eligible: true, isNew: true };
        items = items.concat([c]);
        subs.forEach(fn => fn({ type: 'added', contribution: c }));
        return c;
      },
      setEligible(id, eligible){ items = items.map(c => c.id === id ? Object.assign({}, c, { eligible }) : c); subs.forEach(fn => fn({ type: 'changed', id })); }
    };
  }

  AC.data = { THEMES, METROS, createLocalAdapter, hashStr, mulberry32 };
})(window.AC);
