// Περιγραφές tooltip ανά ετικέτα κουμπιού: [κλειδί (ελληνική ετικέτα), ελληνικά, αγγλικά].
// Κανόνες κειμένου (Platform Foundation — Global Rules): ονοματικές, σύντομες, ουδέτερες φράσεις,
// χωρίς προστακτική. Το κλειδί ταιριάζει με το ορατό κείμενο ή με το aria-label του κουμπιού.
// Κουμπιά με ίδια ετικέτα αλλά διαφορετική ενέργεια παίρνουν ρητό data-tip στο στοιχείο.
export const TOOLTIP_TIPS: ReadonlyArray<readonly [string, string, string]> = [
  // Πλοήγηση και κεφαλίδα
  ["Ρυθμίσεις", "Ρυθμίσεις υποτίτλων, αναπαραγωγής και εμφάνισης", "Subtitle, playback and appearance settings"],
  ["Κλείσιμο ρυθμίσεων", "Κλείσιμο των ρυθμίσεων", "Close settings"],
  ["Βιβλιοθήκη", "Επιστροφή στη βιβλιοθήκη βίντεο", "Back to the video library"],
  ["Επιστροφή στη βιβλιοθήκη", "Επιστροφή στη βιβλιοθήκη βίντεο", "Back to the video library"],
  ["Αρχική σελίδα", "Μετάβαση στην αρχική σελίδα", "Go to the home page"],
  ["GreekTube Subs αρχική", "Μετάβαση στην αρχική σελίδα", "Go to the home page"],
  ["GreekTube Subs, αρχική σελίδα", "Μετάβαση στην αρχική σελίδα", "Go to the home page"],
  ["Πίσω στο βίντεο", "Επιστροφή στο βίντεο", "Back to the video"],
  ["Άνοιγμα μενού", "Άνοιγμα του μενού πλοήγησης", "Open the navigation menu"],
  ["Κλείσιμο μενού", "Κλείσιμο του μενού πλοήγησης", "Close the navigation menu"],
  ["Προσθήκη βίντεο", "Προσθήκη νέου βίντεο YouTube στη βιβλιοθήκη", "Add a new YouTube video to the library"],
  ["Αποσύνδεση", "Αποσύνδεση από αυτή τη συσκευή", "Log out on this device"],
  ["Επανάληψη φόρτωσης προφίλ", "Νέα προσπάθεια φόρτωσης του προφίλ", "Try loading the profile again"],
  ["Αλλαγή ονόματος", "Αλλαγή του ονόματος χρήστη", "Change your username"],
  ["Εξαγωγή δεδομένων", "Λήψη των δεδομένων του προφίλ σε αρχείο", "Download your profile data as a file"],

  ["Σκούρο φόντο", "Αλλαγή σε σκούρο φόντο", "Switch to the dark background"],
  ["Φωτεινό φόντο", "Αλλαγή σε φωτεινό φόντο", "Switch to the light background"],

  // Σύνδεση
  ["Σύνδεση", "Σύνδεση σε υπάρχον λογαριασμό", "Sign in to an existing account"],
  ["Δημιουργία Λογαριασμού", "Δημιουργία νέου λογαριασμού", "Create a new account"],
  ["Αλλαγή email", "Διόρθωση της διεύθυνσης email", "Correct the email address"],

  // Βιβλιοθήκη
  ["Όλα", "Όλα τα βίντεο της βιβλιοθήκης", "All videos in the library"],
  ["Νέα", "Μόνο τα νέα βίντεο", "Only new videos"],
  ["Αγαπημένα", "Μόνο τα αγαπημένα βίντεο", "Only favorite videos"],
  ["Ιστορικό προβολών", "Βίντεο με πρόσφατη προβολή", "Recently watched videos"],
  ["Κρυφά", "Βίντεο που έχουν αποκρυφτεί από τη βιβλιοθήκη", "Videos hidden from the library"],
  ["Προβολή όλων", "Μετάβαση στη λίστα όλων των βίντεο", "Go to the full video list"],
  ["Συγχρονισμός", "Συγχρονισμός της βιβλιοθήκης με τον διακομιστή", "Sync the library with the server"],
  ["Καθαρισμός αναζήτησης", "Διαγραφή του κειμένου αναζήτησης", "Clear the search text"],
  ["Συνέχεια προβολής", "Συνέχεια από το σημείο όπου σταμάτησε η προβολή", "Continue from where playback stopped"],
  ["Από την αρχή", "Έναρξη του βίντεο από την αρχή", "Start the video from the beginning"],
  ["Επανάληψη φόρτωσης", "Νέα προσπάθεια φόρτωσης της βιβλιοθήκης", "Try loading the library again"],

  // Βίντεο: στοιχεία και ενέργειες
  ["Αγαπημένο", "Προσθήκη ή αφαίρεση από τα αγαπημένα", "Add to or remove from favorites"],
  ["Προσθήκη στα αγαπημένα", "Προσθήκη του βίντεο στα αγαπημένα", "Add this video to favorites"],
  ["Αφαίρεση από τα αγαπημένα", "Αφαίρεση του βίντεο από τα αγαπημένα", "Remove this video from favorites"],
  ["Κοινοποίηση", "Κοινοποίηση ή αντιγραφή του συνδέσμου του βίντεο", "Share or copy the video link"],
  ["Ο σύνδεσμος αντιγράφηκε", "Ο σύνδεσμος αντιγράφηκε στο πρόχειρο", "Link copied to the clipboard"],
  ["Επεξεργασία βίντεο", "Επεξεργασία των στοιχείων του βίντεο", "Edit video details"],
  ["Επεξεργασία στοιχείων", "Αλλαγή τίτλου, ομιλητή και κατηγορίας του βίντεο", "Edit the video title, speaker and category"],
  ["Διαχείριση υποτίτλων", "Διαχείριση και έλεγχος των υποτίτλων του βίντεο", "Manage and review the video's subtitles"],
  ["Κλείσιμο βιογραφικού", "Κλείσιμο του βιογραφικού", "Close the biography"],

  // Χειριστήρια player
  ["Αναπαραγωγή", "Έναρξη της αναπαραγωγής", "Start playback"],
  ["Παύση", "Παύση της αναπαραγωγής", "Pause playback"],
  ["Πίσω 10 δευτερόλεπτα", "Μετακίνηση 10 δευτερόλεπτα πίσω", "Skip back 10 seconds"],
  ["Μπροστά 10 δευτερόλεπτα", "Μετακίνηση 10 δευτερόλεπτα μπροστά", "Skip forward 10 seconds"],
  ["Αποθήκευση στιγμής", "Αποθήκευση του τρέχοντος σημείου του βίντεο", "Save the current point in the video"],
  ["Σημείωση", "Αποθήκευση του σημείου μαζί με σύντομη σημείωση", "Save the point with a short note"],
  ["Ρύθμιση ή σίγαση ήχου", "Ρύθμιση έντασης ή σίγαση του ήχου", "Adjust the volume or mute"],
  ["Ενεργοποίηση ήχου", "Επαναφορά του ήχου", "Turn the sound back on"],
  ["Σίγαση", "Σίγαση του ήχου", "Mute the sound"],
  ["Επιλογές υποτίτλων", "Μέγεθος υποτίτλων ή απενεργοποίησή τους", "Subtitle size, or turn subtitles off"],
  ["Κείμενο: άνοιγμα", "Εμφάνιση της μεταγραφής δίπλα στο βίντεο", "Show the transcript next to the video"],
  ["Κείμενο: κλείσιμο", "Απόκρυψη της μεταγραφής", "Hide the transcript"],
  ["Κλείσιμο μεταγραφής", "Απόκρυψη της μεταγραφής", "Hide the transcript"],
  ["Πλήρης οθόνη", "Προβολή του βίντεο σε πλήρη οθόνη", "Play the video in fullscreen"],
  ["Έξοδος από πλήρη οθόνη", "Επιστροφή από την πλήρη οθόνη", "Exit fullscreen"],

  // Μετάφραση και υπότιτλοι
  ["Δοκίμασε ξανά", "Νέα προσπάθεια προετοιμασίας των υποτίτλων", "Retry preparing the subtitles"],
  ["Συνέχεια επεξεργασίας", "Συνέχιση της προετοιμασίας των υποτίτλων", "Continue preparing the subtitles"],
  ["Άνοιγμα βίντεο", "Άνοιγμα του βίντεο με τους ελληνικούς υπότιτλους", "Open the video with Greek subtitles"],
  ["Ξεκίνα αυτόματη μετάφραση", "Αυτόματη μετάφραση των υποτίτλων στα ελληνικά", "Translate the subtitles into Greek automatically"],
  ["Λήψη αγγλικού SRT", "Λήψη των αγγλικών υποτίτλων σε αρχείο SRT", "Download the English subtitles as an SRT file"],
  ["Λήψη αγγλικού transcript (.srt)", "Λήψη των αγγλικών υποτίτλων σε αρχείο SRT", "Download the English subtitles as an SRT file"],
  ["Εισαγωγή ελληνικού SRT", "Εισαγωγή έτοιμης ελληνικής μετάφρασης από αρχείο SRT", "Import a finished Greek translation from an SRT file"],
  ["Νέα μετάφραση", "Νέα μετάφραση των υποτίτλων· οι τρέχοντες παραμένουν μέχρι την επικύρωση", "New translation; current subtitles stay until the new ones pass validation"],
  ["Αποθήκευση μόνο", "Αποθήκευση του βίντεο χωρίς μετάφραση", "Save the video without translating"],
  ["Αποθήκευση και αυτόματη μετάφραση", "Αποθήκευση του βίντεο και αυτόματη μετάφραση", "Save the video and translate it automatically"],

  // Φόρμες και παράθυρα
  ["Κλείσιμο", "Κλείσιμο του παραθύρου", "Close this window"],
  ["Ακύρωση", "Κλείσιμο χωρίς αποθήκευση", "Close without saving"],
  ["Αποθήκευση", "Αποθήκευση των αλλαγών", "Save your changes"],
  ["Αποθήκευση αλλαγών", "Αποθήκευση των αλλαγών", "Save your changes"],
  ["Αποθήκευση αλλαγής", "Αποθήκευση της αλλαγής", "Save the change"],
  ["Συνέχεια", "Επαλήθευση και συνέχεια", "Verify and continue"],
];
