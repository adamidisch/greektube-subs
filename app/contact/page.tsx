import LegalPage from "../LegalPage";

export const metadata={title:"Επικοινωνία · GreekTube Subs"};

export default function ContactPage(){
  return <LegalPage eyebrow="CONTACT" title="Επικοινωνία" intro="Για υποστήριξη, θέματα απορρήτου, δικαιώματα περιεχομένου ή γενικές ερωτήσεις σχετικά με το GreekTube Subs.">
    <section><h2>Email</h2><p>Στείλε email στο <a href="mailto:contact@greektubesubs.com">contact@greektubesubs.com</a>.</p></section>
    <section><h2>Τι μπορείς να μας στείλεις</h2><ul><li>Τεχνικό πρόβλημα ή feedback για τη λειτουργία του site.</li><li>Αίτημα σχετικά με προσωπικά δεδομένα ή ιδιωτικότητα.</li><li>Αναφορά για βίντεο, υπότιτλους ή δικαιώματα περιεχομένου.</li><li>Γενική ερώτηση σχετικά με το GreekTube Subs.</li></ul></section>
    <section><h2>Για πιο γρήγορη εξυπηρέτηση</h2><p>Αν το μήνυμα αφορά συγκεκριμένο βίντεο πρόσθεσε το YouTube link ή το link του GreekTube Subs και μια σύντομη περιγραφή του θέματος.</p></section>
  </LegalPage>;
}
