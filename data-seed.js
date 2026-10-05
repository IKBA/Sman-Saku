const DEFAULT_SEEDS = {
  guruProfile: {
    nama: "Guru Pengampu, S.Pd.",
    nip: "",
    sekolah: "SMA Negeri 1 Lasolo",
    mapel: "Mata Pelajaran",
    alamat: "Konawe Utara, Sulawesi Tenggara",
    kepalaSekolah: "",
    kepalaSekolahNip: "",
    foto: null,
    logo: null
  },
  settingsSiswaBaru: {
    mode: "prompt", // "prompt", "auto_kkm", "auto_avg", "manual"
    defaultScore: 75
  },
  masterSheetUrl: "https://docs.google.com/spreadsheets/d/1Er0-r3YCnWzjPDjC-fkN6f9HPBef7KFFSMi56UTala8/edit?usp=sharing",
  absensiScriptUrl: "https://script.google.com/macros/s/AKfycbyXf1l3RkTCCXegsjbn6br0NEWut2MW4zzQjEnfjcRhO1f4uN9kHqJfcI1drCZFohig/exec",
  bobotNilai: {
    "Tugas": 30,
    "UTS": 25,
    "UAS": 25,
    "Ulangan Harian": 10,
    "Nilai Praktek": 10
  },
  kelas: [],
  siswa: [],
  mapel: [
    "Matematika",
    "Fisika",
    "Kimia",
    "Biologi",
    "Bahasa Indonesia",
    "Bahasa Inggris",
    "Pendidikan Agama",
    "PPKn",
    "Sejarah",
    "Seni Budaya",
    "PJOK",
    "Prakarya"
  ],
  jadwal: [],
  absensi: [],
  nilai: [],
  jurnal: [],
  kontakWali: [],
  siswaAsuhan: [],
  jurnalBimbingan: [],
  catatanWali: [],
  layananBK: [],
  peminatanKarirBK: [],
  agendaBK: [],
  kelasBimbinganBK: []
};

// Ekspor agar bisa diakses atau di-import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEFAULT_SEEDS;
}
