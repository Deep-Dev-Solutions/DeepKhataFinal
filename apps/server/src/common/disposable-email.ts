import { BadRequestException } from '@nestjs/common';

/**
 * Well-known throwaway / disposable mail domains (static, no network).
 * Matching is case-insensitive and subdomain-aware: "x.mailinator.com" is
 * blocked because "mailinator.com" is. Operators extend the list with
 * DISPOSABLE_EMAIL_EXTRA and override it with DISPOSABLE_EMAIL_ALLOW (both
 * comma lists of domains; the allow list wins).
 */
const DOMAINS = `
mailinator.com mailinator.net mailinator.org mailinator2.com mailinater.com mailinator.us
binkmail.com bobmail.info chammy.info devnullmail.com letthemeatspam.com mailinater.com
notmailinator.com reallymymail.com reconmail.com safetymail.info sendspamhere.com
sogetthis.com spamherelots.com spamhereplease.com spamthisplease.com streetwisemail.com
suremail.info thisisnotmyrealemail.com tradermail.info veryrealemail.com zippymail.info
guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de
guerrillamail.info guerrillamailblock.com grr.la sharklasers.com pokemail.net spam4.me
guerrilla.ml
10minutemail.com 10minutemail.net 10minutemail.org 10minutemail.co.uk 10minutemail.de
10minutemail.info 10minutesmail.com 20minutemail.com 20minutemail.it 30minutemail.com
60minutemail.com 10mail.org 10mail.com minutemail.com
tempmail.com tempmail.net tempmail.org tempmail.de tempmail.eu tempmail.it tempmail.us
tempmail.io tempmail.dev tempmail.plus tempmail.email tempmail.ninja tempmailo.com
temp-mail.org temp-mail.io temp-mail.ru temp-mail.com temp-mail.de temp-mail.net
tempmailaddress.com tempmail2.com tempemail.com tempemail.net tempemail.co tempinbox.com
tempinbox.xyz tempr.email temporarymail.com temporary-mail.net tempail.com tmpmail.net
tmpmail.org tmpeml.com tmail.ws tmails.net tmailinator.com
yopmail.com yopmail.net yopmail.fr yopmail.org yopmail.info cool.fr.nf jetable.fr.nf
nospam.ze.tc nomail.xl.cx mega.zik.dj speed.1s.fr courriel.fr.nf moncourrier.fr.nf
monemail.fr.nf monmail.fr.nf yopmail.gq
trashmail.com trashmail.net trashmail.org trashmail.de trashmail.at trashmail.io
trashmail.me trashmail.ws trashmail.xyz trash-mail.com trash-mail.at trash-mail.de
trashmail.fr trashmailer.com trashemail.de trash2009.com trashymail.com trashymail.net
kurzepost.de wegwerfmail.de wegwerfmail.net wegwerfmail.org wegwerfemail.de
getnada.com nada.email nada.ltd abyssmail.com boximail.com clrmail.com dropjar.com
getairmail.com givmail.com inboxbear.com robot-mail.com tafmail.com vomoto.com zetmail.com
dispostable.com maildrop.cc maildrop.cf maildrop.ga maildrop.gq maildrop.ml
throwawaymail.com throwawaymail.net throwam.com throwaway.email
fakeinbox.com fakeinbox.net fakeinbox.org fakemail.net fakemailgenerator.com
fake-mail.net fakemail.fr fakemailbox.com
mohmal.com mohmal.im mohmal.in mohmal.tech
emailondeck.com email-fake.com email-fake.net emailfake.com emailfake.net fakeemail.de
33mail.com anonbox.net anonmails.de anonymbox.com
mytemp.email mytempemail.com mytempmail.com mintemail.com mail-temp.com mailtemp.info
mailtemp.net mailtemporaire.com mailtemporaire.fr
spambox.us spambox.info spambox.org spambog.com spambog.de spambog.ru spambog.net
spamgourmet.com spamgourmet.net spamgourmet.org spamex.com spamfree24.com spamfree24.de
spamfree24.eu spamfree24.info spamfree24.net spamfree24.org spamfree.eu spamavert.com
spamevader.com spamgoes.in spamhole.com spamify.com spaml.com spaml.de spamoff.de
spamslicer.com spamspot.com spamstack.net spamthis.co.uk spamtroll.net spam.la
mailcatch.com mailcatch.net mailexpire.com mailfreeonline.com mailguard.me mailin8r.com
mailinator.nl mailme.lv mailmetrash.com mailmoat.com mailnesia.com mailnull.com
mailshell.com mailsiphon.com mailslite.com mailzilla.com mailzilla.org
mailforspam.com mailhazard.com mailhazard.us mailhz.me mailimate.com mailimail.com
mailseal.de mailtothis.com mailtrash.net mailtv.net mailtv.tv mailscrap.com
mailbidon.com mailblocks.com mailbucket.org mailde.de mailde.info maildu.de
maileater.com maileimer.de mailfa.tk mailfs.com mailimate.com mailismagic.com
mailkept.com mailnator.com mailnesia.com mailorg.org mailpick.biz mailproxsy.com
mailquack.com mailrock.biz mailsac.com mailseal.de mailslapping.com mailtemp.info
mailzi.ru
dayrep.com einrot.com fleckens.hu gustr.com jourrapide.com rhyta.com superrito.com
teleworm.us armyspy.com cuvox.de dayrep.com
discard.email discardmail.com discardmail.de dispostable.com disposableemailaddresses.com
disposable-email.ml disposableinbox.com disposablemail.com dispomail.eu
deadaddress.com deadfake.com deadspam.com despam.it despammed.com
dodgeit.com dodgit.com dodgit.org dontreg.com dontsendmespam.de
dump-email.info dumpandjunk.com dumpmail.de dumpyemail.com
e4ward.com easytrashmail.com eyepaste.com
emailsensei.com emailtemporanea.com emailtemporanea.net emailtemporar.ro
emailtemporario.com.br emailthe.net emailto.de emailwarden.com emailx.at.hm
emailxfer.com email60.com emz.net
filzmail.com fastacura.com fastchevy.com fastchrysler.com fastkawasaki.com
fastmazda.com fastmitsubishi.com fastnissan.com fastsubaru.com fastsuzuki.com
fasttoyota.com fastyamaha.com
get2mail.fr get1mail.com getonemail.com getonemail.net
great-host.in guerillamail.biz guerillamail.com guerillamail.de guerillamail.net
guerillamail.org
haltospam.com harakirimail.com hidemail.de hmamail.com
ieatspam.eu ieatspam.info imails.info inbax.tk inboxalias.com inboxclean.com
inboxclean.org incognitomail.com incognitomail.net incognitomail.org instant-mail.de
ipoo.org irish2me.com
jetable.com jetable.net jetable.org jnxjn.com junk1e.com
kasmail.com kaspop.com killmail.com killmail.net klassmaster.com klzlk.com
koszmail.pl kulturbetrieb.info kurzepost.de
lawlita.com letthemeatspam.com lhsdv.com lifebyfood.com link2mail.net litedrop.com
lookugly.com lortemail.dk lovemeleaveme.com lr78.com lroid.com lukop.dk
m21.cc mail-temporaire.fr mail.mezimages.net mail2rss.org
 mail4trash.com
meltmail.com messagebeamer.de mierdamail.com migmail.pl mintemail.com
moburl.com mt2009.com mt2014.com mt2015.com mx0.wwwnew.eu
my10minutemail.com mypartyclip.de myphantomemail.com mysamp.de
myspaceinc.com myspaceinc.net myspaceinc.org myspacepimpedup.com myspamless.com
 nepwk.com nervmich.net nervtmich.net netmails.com netmails.net
neverbox.com no-spam.ws nobulk.com noclickemail.com nogmailspam.info nomail.pw
nomail2me.com nomorespamemails.com nospam4.us nospamfor.us nospamthanks.info
nowmymail.com nurfuerspam.de
objectmail.com obobbo.com odnorazovoe.ru oneoffemail.com onewaymail.com
 oopi.org opayq.com ordinaryamerican.net otherinbox.com owlpic.com
pancakemail.com plexolan.de politikerclub.de poofy.org pookmail.com
privatdemail.net proxymail.eu prtnx.com punkass.com putthisinyourspamdatabase.com
quickinbox.com rcpt.at recode.me recursor.net regbypass.com regbypass.com
rejectmail.com rklips.com rmqkr.net rppkn.com rtrtr.com
s0ny.net safe-mail.net safersignup.de safetypost.de sandelf.de saynotospams.com
selfdestructingmail.com sendspamhere.com senseless-entertainment.com
shieldedmail.com shiftmail.com shitmail.me shortmail.net
skeefmail.com slaskpost.se slopsbox.com smashmail.de smellfear.com snakemail.com
sneakemail.com sneakmail.de snkmail.com sofimail.com sogetthis.com soodonims.com
spoofmail.de squizzy.de ssoia.com startkeys.com stinkefinger.net stuffmail.de
supergreatmail.com supermailer.jp superstachel.de suremail.info
sweetxxx.de tagyourself.com talkinator.com techemail.com teewars.org teleosaurs.xyz
teleworm.com tempmailer.com tempmailer.de tempomail.fr temporaryemail.net
temporaryemail.us temporaryforwarding.com temporaryinbox.com thankyou2010.com
thc.st thecloudindex.com thisisnotmyrealemail.com throwawayemailaddress.com
tilien.com tittbit.in tizi.com tradermail.info trash-amil.com trashinbox.com
trbvm.com trillianpro.com turual.com twinmail.de tyldd.com
uggsrock.com upliftnow.com uplipht.com uroid.com
venompen.com veryrealemail.com vidchart.com viditag.com viewcastmedia.com
viewcastmedia.net viewcastmedia.org vubby.com
walala.org walkmail.net webemail.me webm4il.info wegwerfadresse.de wetrainbayarea.com
wetrainbayarea.org wh4f.org whyspam.me willhackforfood.biz willselfdestruct.com
winemaven.info wronghead.com wuzup.net wuzupmail.net
xagloo.com xemaps.com xents.com xmaily.com xoxy.net
yapped.net yep.it yogamaven.com yuurok.com
z1p.biz zehnminuten.de zehnminutenmail.de zippymail.info zoaxe.com zoemail.org
burnermail.io burner.kiwi byom.de clipmail.eu cmail.club crazymailing.com
cuvox.de deadaddress.com deagot.com dingbone.com disign-concept.eu
dcemail.com despammed.com devnullmail.com dfgh.net
discardmail.com doiea.com domozmail.com dotmsg.com drdrb.com drdrb.net
duam.net dudmail.com duskmail.com
easy-trash-mail.com ee1.pl ee2.pl emaildienst.de emailgo.de emailias.com
emailigo.de emailinfive.com emaillime.com emailmiser.com emailsingularity.net
enterto.com ephemail.net etranquil.com etranquil.net etranquil.org
evopo.com explodemail.com
fakedemail.com fakemailz.com fansworldwide.de fantasymail.de fightallspam.com
fivemail.de fixmail.tk flyspam.com footard.com forgetmail.com fr33mail.info
frapmail.com fudgerub.com fuirio.com
gelitik.in germanmails.biz gishpuppy.com goemailgo.com gotmail.com gotmail.net
gotmail.org gowikibooks.com gowikicampus.com gowikicars.com gowikifilms.com
gowikigames.com gowikimusic.com gowikinetwork.com gowikitravel.com gowikitv.com
grandmamail.com grandmasmail.com great-host.in greensloth.com grr.la gsrv.co.uk
h8s.org haltospam.com hatespam.org herp.in hidemail.de hochsitze.com
hotmail.fr.nf hulapla.de
imgof.com imgv.de imstations.com inboxproxy.com incognitomail.com
insorg-mail.info instantemailaddress.com internet-e-mail.com
jetable.pp.ua jsrsolutions.com junk.to junkmail.com
kloap.com klzlk.com kost.us
lazyinbox.com letmeinonthis.com link2mail.net litedrop.com lol.ovpn.to
luckymail.org
mbx.cc mcache.net meinspamschutz.de mezimages.net mintemail.com
mohmal.com monumentmail.com mt2009.com muchomail.com
nincsmail.hu nmail.cf noblepioneer.com nomail.cf nospam.wins.com.br
notsharingmy.info nwldx.com
oroki.de otherinbox.com
pjjkp.com plhk.ru pookmail.com proxymail.eu
quickmail.nl
rmqkr.net rotaniliam.com rowe-solutions.com royaldoodles.org
 sharklasers.com shieldemail.com smapfree24.com
smtp99.com sneakemail.com spamarrest.com
spamfighter.cf spamfighter.ga spamfighter.gq spamfighter.ml spamfighter.tk
tempinbox.co.uk tempthe.net thanksnospam.info thrma.com
tmailinator.com toiea.com tokenmail.de trayna.com tryalert.com
tvchd.com twzhhq.online
vpn.st
yomail.info
zxcvbnm.in
inboxkitten.com getairmail.com mail7.io mail-temp.com moakt.com tmpbox.net
emailnax.com fexbox.org fexpost.com fexbox.ru discard.cf linshiyouxiang.net
luxusmail.org mailpoof.com mintemail.com guerrillamail.pro cuvox.de vintomaper.com
tempsky.com tempmailin.com nowmail.net hostguru.top tmpmail.net teml.net
one-time.email lroid.com
`;

const BUILT_IN = new Set(
  DOMAINS.split(/\s+/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.includes('.')),
);

function parseList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  );
}

/** Domain part of an address, lowercased; null when there is no "@". */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  return domain || null;
}

/** "a.b.mailinator.com" -> ["a.b.mailinator.com", "b.mailinator.com", "mailinator.com", "com"] */
function suffixes(domain: string): string[] {
  const parts = domain.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  const allow = parseList(process.env.DISPOSABLE_EMAIL_ALLOW);
  const extra = parseList(process.env.DISPOSABLE_EMAIL_EXTRA);
  const chain = suffixes(domain);
  if (chain.some((d) => allow.has(d))) return false;
  return chain.some((d) => BUILT_IN.has(d) || extra.has(d));
}

export const EMAIL_DOMAIN_NOT_ALLOWED = 'EMAIL_DOMAIN_NOT_ALLOWED';

/** Throws 400 { code: EMAIL_DOMAIN_NOT_ALLOWED } for a throwaway-mail address. */
export function assertEmailAllowed(email: string): void {
  if (isDisposableEmail(email)) {
    throw new BadRequestException({
      code: EMAIL_DOMAIN_NOT_ALLOWED,
      message:
        'Temporary or disposable email addresses are not accepted. Please use your own email address.',
    });
  }
}

export const DISPOSABLE_DOMAIN_COUNT = BUILT_IN.size;
