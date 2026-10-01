const DEFAULT_SEEDS = {
  guruProfile: {
    nama: "Budi Santoso, S.Pd.",
    nip: "198503112010011003",
    sekolah: "SMA Negeri 1 Jakarta",
    mapel: "Matematika",
    alamat: "Jl. Budi Utomo No. 7, Jakarta Pusat",
    kepalaSekolah: "Drs. H. Ahmad Fauzi, M.Pd.",
    kepalaSekolahNip: "197208151998031002",
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
  kelas: [
    { id: "k-10a", nama: "X IPA 1", waliKelas: "Budi Santoso, S.Pd." },
    { id: "k-10b", nama: "X IPA 2", waliKelas: "Siti Rahma, S.Pd." },
    { id: "k-11a", nama: "XI IPA 1", waliKelas: "Dr. Ahmad Yani" },
    { id: "k-12a", nama: "XII IPA 1", waliKelas: "Dewi Lestari, M.Pd." }
  ],
  siswa: [
    { id: "s-1", nisn: "0098123451", nama: "Aditya Pratama", kelasId: "k-10a", gender: "L", namaWali: "Bambang Pratama", hubungan: "Ayah", noHp: "081234567801", catatan: "Siap dihubungi jika ananda ada kendala" },
    { id: "s-2", nisn: "0098123452", nama: "Bunga Citra", kelasId: "k-10a", gender: "P", namaWali: "Siti Rahayu", hubungan: "Ibu", noHp: "081234567802", catatan: "" },
    { id: "s-3", nisn: "0098123453", nama: "Candra Wijaya", kelasId: "k-10a", gender: "L", namaWali: "Agus Wijaya", hubungan: "Ayah", noHp: "081234567803", catatan: "Harap konfirmasi lewat WA dulu" },
    { id: "s-4", nisn: "0098123454", nama: "Dian Sastro", kelasId: "k-10a", gender: "P", namaWali: "Dewi Kurnia", hubungan: "Ibu", noHp: "081234567804", catatan: "" },
    { id: "s-5", nisn: "0098123455", nama: "Eko Prasetyo", kelasId: "k-10a", gender: "L", namaWali: "Hadi Prasetyo", hubungan: "Wali", noHp: "081234567805", catatan: "Paman ananda" },
    { id: "s-6", nisn: "0098123456", nama: "Farhan Hakim", kelasId: "k-10b", gender: "L", namaWali: "Lukman Hakim", hubungan: "Ayah", noHp: "081234567806", catatan: "" },
    { id: "s-7", nisn: "0098123457", nama: "Gita Gutawa", kelasId: "k-10b", gender: "P", namaWali: "Erwin Gutawa", hubungan: "Ayah", noHp: "081234567807", catatan: "" },
    { id: "s-8", nisn: "0098123458", nama: "Hendra Setiawan", kelasId: "k-10b", gender: "L", namaWali: "Sri Mulyani", hubungan: "Ibu", noHp: "081234567808", catatan: "" },
    { id: "s-9", nisn: "0098123459", nama: "Indah Permata", kelasId: "k-10b", gender: "P", namaWali: "Rudi Hartono", hubungan: "Ayah", noHp: "081234567809", catatan: "" },
    { id: "s-10", nisn: "0098123460", nama: "Joko Widodo", kelasId: "k-10b", gender: "L", namaWali: "Noto Mihardjo", hubungan: "Ayah", noHp: "081234567810", catatan: "" },
    { id: "s-11", nisn: "0098123461", nama: "Kevin Sanjaya", kelasId: "k-11a", gender: "L", namaWali: "Sugiarto Sukamuljo", hubungan: "Ayah", noHp: "081234567811", catatan: "" },
    { id: "s-12", nisn: "0098123462", nama: "Lestari Putri", kelasId: "k-11a", gender: "P", namaWali: "Nur Asiah", hubungan: "Ibu", noHp: "081234567812", catatan: "" },
    { id: "s-13", nisn: "0098123463", nama: "Mahendra Putra", kelasId: "k-12a", gender: "L", namaWali: "Surya Mahendra", hubungan: "Ayah", noHp: "081234567813", catatan: "" },
    { id: "s-14", nisn: "0098123464", nama: "Nadia Vega", kelasId: "k-12a", gender: "P", namaWali: "Farida Vega", hubungan: "Ibu", noHp: "081234567814", catatan: "" }
  ],
  mapel: ["Matematika", "Fisika", "Kimia", "Biologi", "Bahasa Indonesia", "Bahasa Inggris"],
  jadwal: [
    { id: "j-1", hari: "Senin", jamMulai: "07:30", jamSelesai: "09:00", kelasId: "k-10a", mapel: "Matematika" },
    { id: "j-2", hari: "Senin", jamMulai: "09:30", jamSelesai: "11:00", kelasId: "k-10b", mapel: "Matematika" },
    { id: "j-3", hari: "Selasa", jamMulai: "08:00", jamSelesai: "09:30", kelasId: "k-11a", mapel: "Matematika" },
    { id: "j-4", hari: "Rabu", jamMulai: "10:00", jamSelesai: "11:30", kelasId: "k-12a", mapel: "Matematika" },
    { id: "j-5", hari: "Kamis", jamMulai: "07:30", jamSelesai: "09:00", kelasId: "k-10a", mapel: "Matematika" },
    { id: "j-6", hari: "Jumat", jamMulai: "08:00", jamSelesai: "09:30", kelasId: "k-10b", mapel: "Matematika" }
  ],
  absensi: [
    { id: "a-1", tanggal: "2026-05-18", kelasId: "k-10a", siswaId: "s-1", status: "Hadir", mapel: "Matematika" },
    { id: "a-2", tanggal: "2026-05-18", kelasId: "k-10a", siswaId: "s-2", status: "Hadir", mapel: "Matematika" },
    { id: "a-3", tanggal: "2026-05-18", kelasId: "k-10a", siswaId: "s-3", status: "Izin", mapel: "Matematika" },
    { id: "a-4", tanggal: "2026-05-18", kelasId: "k-10a", siswaId: "s-4", status: "Terlambat", mapel: "Matematika" },
    { id: "a-5", tanggal: "2026-05-18", kelasId: "k-10a", siswaId: "s-5", status: "Hadir", mapel: "Matematika" },
    { id: "a-6", tanggal: "2026-05-19", kelasId: "k-10a", siswaId: "s-1", status: "Hadir", mapel: "Matematika" },
    { id: "a-7", tanggal: "2026-05-19", kelasId: "k-10a", siswaId: "s-2", status: "Sakit", mapel: "Matematika" },
    { id: "a-8", tanggal: "2026-05-19", kelasId: "k-10a", siswaId: "s-3", status: "Hadir", mapel: "Matematika" },
    { id: "a-9", tanggal: "2026-05-19", kelasId: "k-10a", siswaId: "s-4", status: "Hadir", mapel: "Matematika" },
    { id: "a-10", tanggal: "2026-05-19", kelasId: "k-10a", siswaId: "s-5", status: "Alpa", mapel: "Matematika" },
    { id: "a-11", tanggal: "2026-05-20", kelasId: "k-10a", siswaId: "s-1", status: "Hadir", mapel: "Matematika" },
    { id: "a-12", tanggal: "2026-05-20", kelasId: "k-10a", siswaId: "s-2", status: "Hadir", mapel: "Matematika" },
    { id: "a-13", tanggal: "2026-05-20", kelasId: "k-10a", siswaId: "s-3", status: "Terlambat", mapel: "Matematika" },
    { id: "a-14", tanggal: "2026-05-20", kelasId: "k-10a", siswaId: "s-4", status: "Bolos", mapel: "Matematika" },
    { id: "a-15", tanggal: "2026-05-20", kelasId: "k-10a", siswaId: "s-5", status: "Hadir", mapel: "Matematika" }
  ],
  nilai: [
    // Siswa 1 - Aditya Pratama
    { id: "n-1a", siswaId: "s-1", mapel: "Matematika", jenis: "Tugas", label: "Tugas 1", nilai: 85, tanggal: "2026-05-12" },
    { id: "n-1b", siswaId: "s-1", mapel: "Matematika", jenis: "Tugas", label: "Tugas 2", nilai: 88, tanggal: "2026-05-19" },
    { id: "n-1c", siswaId: "s-1", mapel: "Matematika", jenis: "UTS", label: "UTS 1", nilai: 80, tanggal: "2026-05-15" },
    { id: "n-1d", siswaId: "s-1", mapel: "Matematika", jenis: "UAS", label: "UAS 1", nilai: 88, tanggal: "2026-05-22" },
    // Siswa 2 - Bunga Citra
    { id: "n-2a", siswaId: "s-2", mapel: "Matematika", jenis: "Tugas", label: "Tugas 1", nilai: 90, tanggal: "2026-05-12" },
    { id: "n-2b", siswaId: "s-2", mapel: "Matematika", jenis: "Tugas", label: "Tugas 2", nilai: 92, tanggal: "2026-05-19" },
    { id: "n-2c", siswaId: "s-2", mapel: "Matematika", jenis: "UTS", label: "UTS 1", nilai: 85, tanggal: "2026-05-15" },
    { id: "n-2d", siswaId: "s-2", mapel: "Matematika", jenis: "UAS", label: "UAS 1", nilai: 92, tanggal: "2026-05-22" },
    // Siswa 3 - Candra Wijaya
    { id: "n-3a", siswaId: "s-3", mapel: "Matematika", jenis: "Tugas", label: "Tugas 1", nilai: 75, tanggal: "2026-05-12" },
    { id: "n-3b", siswaId: "s-3", mapel: "Matematika", jenis: "UTS", label: "UTS 1", nilai: 70, tanggal: "2026-05-15" },
    { id: "n-3c", siswaId: "s-3", mapel: "Matematika", jenis: "UAS", label: "UAS 1", nilai: 80, tanggal: "2026-05-22" },
    // Siswa 4 - Dian Sastro
    { id: "n-4a", siswaId: "s-4", mapel: "Matematika", jenis: "Tugas", label: "Tugas 1", nilai: 80, tanggal: "2026-05-12" },
    { id: "n-4b", siswaId: "s-4", mapel: "Matematika", jenis: "Tugas", label: "Tugas 2", nilai: 82, tanggal: "2026-05-19" },
    { id: "n-4c", siswaId: "s-4", mapel: "Matematika", jenis: "UTS", label: "UTS 1", nilai: 78, tanggal: "2026-05-15" },
    { id: "n-4d", siswaId: "s-4", mapel: "Matematika", jenis: "UAS", label: "UAS 1", nilai: 82, tanggal: "2026-05-22" },
    // Siswa 5 - Eko Prasetyo
    { id: "n-5a", siswaId: "s-5", mapel: "Matematika", jenis: "Tugas", label: "Tugas 1", nilai: 60, tanggal: "2026-05-12" },
    { id: "n-5b", siswaId: "s-5", mapel: "Matematika", jenis: "UTS", label: "UTS 1", nilai: 65, tanggal: "2026-05-15" },
    { id: "n-5c", siswaId: "s-5", mapel: "Matematika", jenis: "UAS", label: "UAS 1", nilai: 70, tanggal: "2026-05-22" }
  ],
  jurnal: [
    { id: "jrn-1", tanggal: "2026-05-18", kelasId: "k-10a", mapel: "Matematika", materi: "Persamaan Kuadrat - Pengenalan dan Faktorisasi", hambatan: "Beberapa siswa belum lancar memfaktorkan bentuk a > 1", solusi: "Diberikan latihan tambahan berkelompok di kelas" },
    { id: "jrn-2", tanggal: "2026-05-19", kelasId: "k-10a", mapel: "Matematika", materi: "Rumus Kuadratik (Rumus ABC)", hambatan: "Siswa sering salah tanda minus (-) saat menghitung b^2 - 4ac", solusi: "Menuliskan langkah diskriminan secara terpisah di papan tulis" }
  ],
  kontakWali: [
    { id: "kw-sma-1", sekolah: "SMA Negeri 1 Jakarta", nisn: "0098123451", namaSiswa: "Aditya Pratama", kelasNama: "X IPA 1", namaWali: "Bambang Pratama", hubungan: "Ayah", noHp: "081234567801", catatan: "SMA Negeri 1 Jakarta" },
    { id: "kw-smp-1", sekolah: "SMP Negeri 2 Jakarta", nisn: "0098991122", namaSiswa: "Aditya Pratama", kelasNama: "VIII B", namaWali: "Drs. Hendro Wibowo", hubungan: "Ayah", noHp: "081398765432", catatan: "SMP Negeri 2 Jakarta - Nama Siswa Sama Tapi Beda Sekolah" },
    { id: "kw-smp-2", sekolah: "SMP Negeri 2 Jakarta", nisn: "0098991123", namaSiswa: "Rizky Ramadhan", kelasNama: "VIII A", namaWali: "Hj. Siti Aminah", hubungan: "Ibu", noHp: "081512349988", catatan: "SMP Negeri 2 Jakarta" }
  ],
  siswaAsuhan: ["s-3", "s-5", "s-8"],
  jurnalBimbingan: [
    { id: "jb-1", tanggal: "2026-05-18", siswaId: "s-5", bidang: "Akademik", pokokBahasan: "Konseling kesulitan pemahaman materi aljabar & motivasi belajar", status: "Perlu Pendampingan", catatan: "Siswa berjanji mengerjakan latihan remedial" },
    { id: "jb-2", tanggal: "2026-05-19", siswaId: "s-3", bidang: "Disiplin", pokokBahasan: "Keterlambatan masuk kelas jam pertama", status: "Tuntas", catatan: "Orang tua sudah dikonfirmasi dan mendukung siswa berangkat lebih awal" }
  ]
};

// Ekspor agar bisa diakses atau di-import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEFAULT_SEEDS;
}
