#!/usr/bin/env python3
"""Uji lapisan otorisasi berbutir (Tahap B).

Empat pertanyaan berbeda atas kamera yang sama harus bisa dijawab berbeda.
Yang paling mudah salah: menyamakan boleh_ubah dengan boleh_bagi, sebab
keduanya terasa mirip padahal justru pemisahannya yang mewujudkan masking —
Admin boleh meneruskan kamera Super Admin, tapi tidak boleh menyuntingnya.

Uji berjalan di basis data sungguhan memakai tabel bersalinan, lalu
membersihkannya. Fungsi diambil dari backend/main.py apa adanya.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

os.environ.setdefault("DB_HOST", "localhost")

P = subprocess.run(
    ["grep", "-oP", r"DB_PASS=\K[^\"]+",
     "/etc/systemd/system/cctv-backend.service"],
    capture_output=True, text=True).stdout.strip()
os.environ.setdefault("DB_PASS", P)
os.environ.setdefault("DB_USER", "cctv_user")
os.environ.setdefault("DB_NAME", "cctv_monitoring")

import main  # noqa: E402
from main import (  # noqa: E402
    SessionLocal, UserModel, CCTVStreamModel,
    StreamAdminGrantModel, StreamPermissionModel,
    boleh_tonton, boleh_playback, boleh_ubah, boleh_bagi, boleh_kelola_izin,
    boleh_lihat_rtsp,
    kuasa_penuh,
)

lolos = gagal = 0


def uji(nama, kondisi, info=""):
    global lolos, gagal
    if kondisi:
        lolos += 1
        print(f"  ok   {nama}")
    else:
        gagal += 1
        print(f"  GAGAL {nama} {info}")


db = SessionLocal()
dibuat = {"users": [], "streams": []}


def bersihkan():
    for uid in dibuat["users"]:
        db.query(StreamPermissionModel).filter(
            StreamPermissionModel.user_id == uid).delete()
        db.query(StreamAdminGrantModel).filter(
            StreamAdminGrantModel.admin_id == uid).delete()
    for sid in dibuat["streams"]:
        db.query(StreamPermissionModel).filter(
            StreamPermissionModel.stream_id == sid).delete()
        db.query(StreamAdminGrantModel).filter(
            StreamAdminGrantModel.stream_id == sid).delete()
    db.commit()
    for sid in dibuat["streams"]:
        db.query(CCTVStreamModel).filter(CCTVStreamModel.id == sid).delete()
    for uid in dibuat["users"]:
        db.query(UserModel).filter(UserModel.id == uid).delete()
    db.commit()


def buat_user(nama, peran, induk=None):
    u = UserModel(username=f"tb_{nama}", password_hash="x", role=peran,
                  parent_admin_id=induk)
    db.add(u)
    db.commit()
    db.refresh(u)
    dibuat["users"].append(u.id)
    return u


def buat_stream(nama, pemilik):
    s = CCTVStreamModel(name=f"tb_{nama}", rtsp_url=f"rtsp://{nama}",
                        owner_id=pemilik, is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    dibuat["streams"].append(s.id)
    return s


try:
    # ── Susunan: SA memiliki kam_sa; admin1 memiliki kam_a1 ────────────────
    sa = buat_user("sa", "super_admin")
    a1 = buat_user("a1", "admin")
    a2 = buat_user("a2", "admin")
    u1 = buat_user("u1", "user", induk=a1.id)
    g1 = buat_user("g1", "guest", induk=a1.id)

    kam_sa = buat_stream("kamsa", sa.id)      # milik Super Admin
    kam_a1 = buat_stream("kama1", a1.id)      # milik admin1

    print("=== kuasa penuh melihat segalanya ===")
    for f, n in ((boleh_tonton, "tonton"), (boleh_playback, "playback"),
                 (boleh_ubah, "ubah"), (boleh_bagi, "bagi")):
        uji(f"super_admin boleh {n} kamera siapa pun",
            f(sa, kam_a1.id, db) is True)

    print("\n=== admin atas kameranya sendiri ===")
    uji("admin boleh tonton kameranya", boleh_tonton(a1, kam_a1.id, db))
    uji("admin boleh ubah kameranya", boleh_ubah(a1, kam_a1.id, db))
    uji("admin boleh bagi kameranya", boleh_bagi(a1, kam_a1.id, db))

    print("\n=== admin TANPA pemberian: kamera Super Admin tertutup ===")
    uji("tidak boleh tonton", not boleh_tonton(a1, kam_sa.id, db))
    uji("tidak boleh ubah", not boleh_ubah(a1, kam_sa.id, db))
    uji("tidak boleh bagi", not boleh_bagi(a1, kam_sa.id, db))

    print("\n=== MASKING: diberi lihat saja (can_manage=0, can_reshare=1) ===")
    db.add(StreamAdminGrantModel(stream_id=kam_sa.id, admin_id=a1.id,
                                 can_manage=False, can_reshare=True,
                                 granted_by=sa.id))
    db.commit()
    uji("admin boleh TONTON kamera pemberian",
        boleh_tonton(a1, kam_sa.id, db))
    uji("admin TIDAK boleh ubah — inilah masking",
        not boleh_ubah(a1, kam_sa.id, db),
        "bila benar, rtsp_url tak pernah dikirim kepadanya")
    uji("admin BOLEH bagi — inilah reshare",
        boleh_bagi(a1, kam_sa.id, db))

    print("\n=== ubah dan bagi memang terpisah ===")
    g = db.query(StreamAdminGrantModel).filter_by(
        stream_id=kam_sa.id, admin_id=a1.id).first()
    g.can_reshare = False
    db.commit()
    uji("reshare dicabut: tidak boleh bagi",
        not boleh_bagi(a1, kam_sa.id, db))
    uji("tapi masih boleh tonton", boleh_tonton(a1, kam_sa.id, db))

    g.can_manage = True
    g.can_reshare = True
    db.commit()
    uji("can_manage=1 tetap tidak boleh ubah kamera Super Admin",
        not boleh_ubah(a1, kam_sa.id, db))
    uji("dan kredensialnya tetap tertutup",
        not boleh_lihat_rtsp(a1, kam_sa.id, db))

    print("\n=== admin lain tidak kecipratan ===")
    uji("admin2 tidak boleh tonton", not boleh_tonton(a2, kam_sa.id, db))
    uji("admin2 tidak boleh ubah", not boleh_ubah(a2, kam_sa.id, db))

    print("\n=== user: tonton dan playback terpisah ===")
    db.add(StreamPermissionModel(stream_id=kam_a1.id, user_id=u1.id,
                                 can_view=True, can_playback=False,
                                 granted_by=a1.id))
    db.commit()
    uji("user boleh tonton", boleh_tonton(u1, kam_a1.id, db))
    uji("user TIDAK boleh playback — izin terpisah",
        not boleh_playback(u1, kam_a1.id, db))

    izin = db.query(StreamPermissionModel).filter_by(
        stream_id=kam_a1.id, user_id=u1.id).first()
    izin.can_playback = True
    db.commit()
    uji("playback dinyalakan: boleh", boleh_playback(u1, kam_a1.id, db))

    izin.can_view = False
    db.commit()
    uji("view dicabut: tidak boleh tonton",
        not boleh_tonton(u1, kam_a1.id, db))
    uji("tapi playback masih boleh — sungguh terpisah",
        boleh_playback(u1, kam_a1.id, db))

    print("\n=== user tidak punya wewenang mengelola ===")
    uji("user tidak boleh ubah", not boleh_ubah(u1, kam_a1.id, db))
    uji("user tidak boleh bagi", not boleh_bagi(u1, kam_a1.id, db))

    print("\n=== ATURAN GUEST: admin hanya menyentuh pemberiannya sendiri ===")
    db.add(StreamPermissionModel(stream_id=kam_a1.id, user_id=g1.id,
                                 can_view=True, granted_by=a1.id))
    db.commit()
    uji("admin1 boleh kelola pemberiannya sendiri",
        boleh_kelola_izin(a1, kam_a1.id, g1.id, db))

    izin_g = db.query(StreamPermissionModel).filter_by(
        stream_id=kam_a1.id, user_id=g1.id).first()
    izin_g.granted_by = sa.id
    db.commit()
    uji("admin1 TIDAK boleh kelola pemberian Super Admin",
        not boleh_kelola_izin(a1, kam_a1.id, g1.id, db),
        "inilah aturan yang diminta: hanya pemberian sendiri")

    izin_g.granted_by = a2.id
    db.commit()
    uji("admin1 TIDAK boleh kelola pemberian admin lain",
        not boleh_kelola_izin(a1, kam_a1.id, g1.id, db))

    uji("super_admin boleh kelola pemberian siapa pun",
        boleh_kelola_izin(sa, kam_a1.id, g1.id, db))

    print("\n=== guest tidak bisa mengelola apa pun ===")
    uji("guest tidak boleh ubah", not boleh_ubah(g1, kam_a1.id, db))
    uji("guest tidak boleh bagi", not boleh_bagi(g1, kam_a1.id, db))
    uji("guest tidak boleh kelola izin",
        not boleh_kelola_izin(g1, kam_a1.id, u1.id, db))

    print("\n=== kamera tak dikenal ditolak, bukan menggagalkan program ===")
    uji("tonton kamera 999999", not boleh_tonton(u1, 999999, db))
    uji("ubah kamera 999999", not boleh_ubah(a1, 999999, db))
    uji("bagi kamera 999999", not boleh_bagi(a1, 999999, db))

    print("\n=== kunci API tidak pernah lolos jalur kuasa penuh ===")
    class KunciPalsu:
        role = "apikey"
        id = None
        streams = [kam_a1]
        class key_record:
            include_playback = False

    k = KunciPalsu()
    uji("kunci bukan kuasa penuh", not kuasa_penuh(k))
    uji("kunci boleh tonton kamera miliknya", boleh_tonton(k, kam_a1.id, db))
    uji("kunci tidak boleh tonton kamera lain",
        not boleh_tonton(k, kam_sa.id, db))
    uji("kunci tanpa include_playback ditolak",
        not boleh_playback(k, kam_a1.id, db))
    uji("kunci tidak boleh ubah", not boleh_ubah(k, kam_a1.id, db))
    uji("kunci tidak boleh bagi", not boleh_bagi(k, kam_a1.id, db))

finally:
    bersihkan()
    db.close()

print(f"\nHASIL: {lolos} lolos, {gagal} gagal")
sys.exit(1 if gagal else 0)
