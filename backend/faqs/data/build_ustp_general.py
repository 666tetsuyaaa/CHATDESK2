"""
Builds ustp_general_faqs.json: general USTP knowledge from ustp.edu.ph
(read Nov 22, 2026), reviewed and approved by Jefferson (CEA dean: Dr.
Israel A. Baguhin; CSM dean: Dr. RJ Krista Raye Y. Leocadio). Review doc:
https://claude.ai/artifact/K6ESHPnCPnY5qwYRpzb1UN

Load it with:
    python manage.py import_faqs --file faqs/data/ustp_general_faqs.json --apply --embed
(import_faqs only adds/updates these; every other FAQ is kept.)

Officials change - re-check the name answers each school year.
"""

import json
from pathlib import Path

PHONE = "(088) 856-1738"
FAQS = [
    # University
    ("ustp_vision", "What is the vision of USTP?",
     "USTP's vision is to be a nationally recognized Science and Technology University providing the vital link between education and the economy."),
    ("ustp_mission", "What is the mission of USTP?",
     "USTP's mission is to: (1) bring the world of work (industry) into the actual higher education and training of students; (2) offer entrepreneurs the opportunity to maximize their business potential, from product conceptualization to commercialization; and (3) contribute significantly to the national development goals of food security and energy sufficiency through technological solutions."),
    ("ustp_core_values", "What are the core values of USTP?",
     "USTP's core values are Unselfish Dedication, Social Responsiveness, Transformational Leadership, and Prudence."),
    ("ustp_graduate_attributes", "What are the USTP graduate attributes?",
     "USTP graduates are expected to show Innovative Thinking, Critical Thinking, Resilience, Empathy, Teamwork and Collaboration, and Communication Skills."),
    ("ustp_president", "Who is the president of USTP?",
     "The University System President of USTP is Dr. Ambrosio B. Cultura II."),
    ("ustp_cdo_chancellor", "Who is the chancellor of USTP Cagayan de Oro?",
     "The Chancellor of USTP Cagayan de Oro is Atty. Dionel O. Albina."),
    ("ustp_vc_student_affairs", "Who is the Vice Chancellor for Student Affairs and Services of USTP CDO?",
     "Dr. Maria Cecilia L. Pangan is the Vice Chancellor for Student Affairs and Services of USTP Cagayan de Oro."),
    ("ustp_student_service_heads", "Who are the heads of the student service offices at USTP CDO?",
     "Admission and Scholarship, and Student Affairs and Services: Engr. Erich P. Abad. Guidance and Counseling Services: Ms. Lovely M. Apostol. Health Services: Dr. Reeo Elir C. Masigan. University Registrar: Ms. Jonalin T. Lagrada."),
    ("ustp_founded", "When was USTP founded?",
     "USTP was established on August 16, 2016, by Republic Act 10919, which merged the Mindanao University of Science and Technology (MUST) in Cagayan de Oro and the Misamis Oriental State College of Agriculture and Technology (MOSCAT) in Claveria."),
    ("ustp_campuses", "What are the campuses of USTP?",
     "USTP has eight campuses: Alubijid (the main campus), Cagayan de Oro, Claveria, Villanueva, Balubal, Jasaan, Oroquieta and Panaon."),
    ("ustp_cdo_address", "Where is USTP Cagayan de Oro?",
     "USTP Cagayan de Oro is on Claro M. Recto Avenue, Lapasan, Cagayan de Oro City 9000."),
    ("ustp_cdo_contact", "What is the contact number of USTP CDO?",
     f"You can call USTP Cagayan de Oro at {PHONE}. Its Facebook page is facebook.com/USTPcagayan."),
    ("ustp_cdo_colleges", "What colleges are at USTP CDO?",
     "USTP Cagayan de Oro has the College of Engineering and Architecture, College of Information Technology and Computing, College of Science and Mathematics, College of Science and Technology Education, College of Technology, College of Medicine, College of Nursing, and the Senior High School."),
    ("ustp_online_portals", "What online portals do USTP students use?",
     "PRISMS (prisms.ustp.edu.ph) for student records and applications, USTeP (ustep.ustp.edu.ph), eClearance (clearance.ustp.edu.ph), and the USTP Helpdesk (ustp.edu.ph/helpdesk)."),
    ("ustp_logo", "What does the USTP logo mean?",
     "The USTP logo shows atomic particles forming a stylized map of Mindanao with weaving patterns."),
    ("ustp_iso", "Is USTP ISO certified?",
     "Yes. USTP is ISO 9001:2015 certified."),
    # Officials
    ("ustp_vp_academic_affairs", "Who is the Vice President for Academic Affairs of USTP?",
     "Dr. Lory Liza D. Bulay-Og is the Vice President for Academic Affairs of USTP."),
    ("ustp_vp_admin_legal", "Who is the Vice President for Administration and Legal Affairs of USTP?",
     "Atty. Jonathan S. Oche is the Vice President for Administration and Legal Affairs."),
    ("ustp_vp_finance", "Who is the Vice President for Finance and Resource Management of USTP?",
     "Dr. Vanessa V. Ascaño is the Vice President for Finance and Resource Management."),
    ("ustp_vp_research", "Who is the Vice President for Research, Innovation, and Extension of USTP?",
     "Dr. Apolinario B. Gonzaga, Jr. is the Vice President for Research, Innovation, and Extension."),
    ("ustp_vp_global_qa", "Who is the Vice President for Global Engagement and Quality Assurance of USTP?",
     "Dr. Herbert Glenn P. Reyes is the Vice President for Global Engagement and Quality Assurance."),
    ("ustp_vc_academic_affairs", "Who is the Vice Chancellor for Academic Affairs of USTP CDO?",
     "Dr. Jocelyn B. Barbosa is the Vice Chancellor for Academic Affairs of USTP Cagayan de Oro (local 1110)."),
    ("ustp_vc_medical", "Who is the Vice Chancellor for Medical and Allied Health Programs of USTP CDO?",
     "Dr. Mitchel Dennis B. Gonzalez is the Vice Chancellor for Medical and Allied Health Programs of USTP Cagayan de Oro (local 1233)."),
    ("ustp_vc_research", "Who is the Vice Chancellor for Research and Innovation of USTP CDO?",
     "Engr. Alex L. Maureal is the Vice Chancellor for Research and Innovation of USTP Cagayan de Oro (local 1160)."),
    ("ustp_vc_finance_admin", "Who is the Vice Chancellor for Finance and Administration of USTP CDO?",
     "Atty. Jonathan S. Oche is the Vice Chancellor for Finance and Administration of USTP Cagayan de Oro (local 1106)."),
    # Colleges, deans and programs
    ("ustp_dean_citc", "Who is the dean of CITC?",
     "Dr. Junar A. Landicho is the Dean of the College of Information Technology and Computing (CITC), local 1154."),
    ("ustp_citc_departments", "What departments are in CITC?",
     "CITC has the Department of Computer Science, Department of Data Science, Department of Information Technology, and Department of Technology Communication Management, plus an Entrepreneurship Service Unit."),
    ("ustp_dean_cea", "Who is the dean of CEA?",
     "Dr. Israel A. Baguhin is the Dean of the College of Engineering and Architecture (CEA)."),
    ("ustp_cea_programs", "What programs does CEA offer?",
     "Undergraduate: BS Architecture, BS Civil Engineering, BS Mechanical Engineering, BS Computer Engineering, BS Geodetic Engineering, BS Electrical Engineering, and BS Electronics Engineering. Graduate: Master of Engineering, MS Electrical Engineering, MS Sustainable Development (Urban Planning and Sustainable Development), Professional Science Masters in Power Systems Engineering and Management, and PhD in Energy Engineering."),
    ("ustp_dean_csm", "Who is the dean of CSM?",
     "Dr. RJ Krista Raye Y. Leocadio is the Dean of the College of Science and Mathematics (CSM), local 1127."),
    ("ustp_csm_programs", "What programs does CSM offer?",
     "Undergraduate: BS Applied Mathematics, BS Applied Physics, BS Chemistry, BS Environmental Science, and BS Food Technology. Graduate: MS Applied Mathematics, MS Environmental Science and Technology (Natural Science), and PhD in Applied Mathematics."),
    ("ustp_dean_cste", "Who is the dean of CSTE?",
     "Dr. Grace S. Pimentel is the Dean of the College of Science and Technology Education (CSTE), local 1105."),
    ("ustp_cste_programs", "What programs does CSTE offer?",
     "Undergraduate: Bachelor of Secondary Education major in Science, Bachelor of Secondary Education major in Mathematics, Bachelor in Technology and Livelihood Education, and Bachelor in Technical-Vocational Teacher Education. Also a Certificate of Teaching, master's programs in Mathematics Education, Science Education (Chemistry, Physics), Teaching Special Education, Teaching English as a Second Language, and Technical and Technology Education, and doctorates in Mathematics Education, Science Education (Chemistry), and Technology Education."),
    ("ustp_dean_cot", "Who is the dean of the College of Technology?",
     "Dr. Ruvel J. Cuasito Sr. is the Dean of the College of Technology (COT), local 1151."),
    ("ustp_cot_programs", "What programs does the College of Technology offer?",
     "BS Electronics Technology, BS Autotronics, BS Energy Systems and Management, BS Electro-Mechanical Technology, and BS Manufacturing Engineering Technology."),
    ("ustp_dean_medicine", "Who is the dean of the College of Medicine?",
     "Dr. Joanne Mae N. Antolin is the Dean of the College of Medicine, local 1135."),
    ("ustp_medicine_requirements", "What are the requirements to enter the USTP College of Medicine?",
     "Per the college page: a Filipino citizen aged 20 to 35, a bachelor's degree earned within the last five years, an NMAT score in the 80th percentile or higher (taken within 2 years), a GWA of 85% or better in English, Mathematics, Chemistry, Zoology and Social Science, and a passed panel interview. Selection: NMAT 40%, GWA 40%, interview 20%."),
    ("ustp_dean_nursing", "Who is the dean of the College of Nursing?",
     "Mr. Jan Michael R. Remolado, RN, MAN, is the Dean of the College of Nursing, local 1259."),
    ("ustp_shs_principal", "Who is the principal of the USTP Senior High School?",
     "Dr. Grace S. Pimentel is the Principal of the USTP Cagayan de Oro Senior High School. The SHS offers the STEM strand."),
    ("ustp_igis_director", "Who heads the Institute of Governance, Innovation and Sustainability (IGIS)?",
     "Dr. Demetria May T. Saniel is the Director of IGIS, local 1156."),
    # Offices and services
    ("ustp_head_osa", "Who is the head of OSA?",
     "Engr. Erich P. Abad is the Director of Student Affairs and Services of USTP Cagayan de Oro, local 1114 or 1125. The office is under Dr. Maria Cecilia L. Pangan, Vice Chancellor for Student Affairs and Services."),
    ("ustp_head_admission_scholarship", "Who is the head of the Admission and Scholarship Office?",
     "Engr. Erich P. Abad is the Director of Admission and Scholarship of USTP Cagayan de Oro, local 1114 or 1125."),
    ("ustp_head_guidance", "Who is the head of Guidance and Counseling?",
     "Ms. Lovely M. Apostol is the Director of Guidance and Counseling Services, local 1130."),
    ("ustp_head_health", "Who is the head of Health Services (the clinic)?",
     "Dr. Reeo Elir C. Masigan is the Director of Health Services, local 1136."),
    ("ustp_registrar", "Who is the University Registrar of USTP CDO?",
     "Ms. Jonalin T. Lagrada is the University Registrar of USTP Cagayan de Oro, local 1137."),
    ("ustp_head_residences", "Who is in charge of the campus dormitories?",
     "Ms. Maria Doreen C. Rañada is the Director of Campus Residences Services."),
    ("ustp_head_sports", "Who is the head of Sports Services?",
     "Mr. Marc John C. Bacayo is the Director of Sports Services, local 1217."),
    ("ustp_head_arts_culture", "Who is the head of Arts and Culture?",
     "Mr. Joel O. Abratiguin is the Director of Arts and Culture, local 1128."),
    ("ustp_head_nstp", "Who is the head of NSTP?",
     "Ms. Gracely H. Hodge is the Director of the National Service Training Program (NSTP), local 1171."),
    ("ustp_head_library", "Who is the head of the USTP CDO library?",
     "Dr. Remedios B. Janier is the Director of Library Services, local 1223."),
    ("ustp_library_location", "Where is the library?",
     "The Main Library is on the 3rd floor of the LRC building. The Graduate Library is on the 2nd floor (right wing) and the Electronic Library on the 2nd floor (left wing) of the LRC building. There are also college libraries: CEA (2nd floor, Engineering Complex), COT (3rd floor, right wing, College of Technology Building) and CSM (ground floor, Science Complex)."),
    ("ustp_library_contact", "How do I contact the library?",
     f"Call {PHONE}: local 134 for the Main Library, 155 for the Graduate Library, 112 for the e-Library. Facebook: facebook.com/ustplibrary."),
    ("ustp_career_center", "What does the Career Center do?",
     "The Career Center and Industry Relations Office helps students plan their careers (Trailblazer Career Services), connects employers with students (Industry Relations Services), and helps alumni find jobs (Alumni Career Services). Its director is Ms. April Marie Allexes B. Rosales-Jumadla, local 1107. Facebook: /USTPCareerCenter."),
    ("ustp_extension_office", "What is the Extension and Community Relations office?",
     "It brings the university's research and services to communities and to industry in the region. Director: Dr. Maria Teresa M. Fajardo. It is on the 2nd floor of the Engineering Building, (088) 856-1739 local 167. Facebook: @ustpecrd."),
    ("ustp_trailblazer", "What is The Trailblazer?",
     "The Trailblazer is the official student publication of USTP Cagayan de Oro, an independent organization committed to freedom of expression and the press and to student rights and welfare."),
    ("ustp_head_ict", "Who is the head of ICT Services?",
     "Engr. Mary Ann E. Telen is the Director of Information and Communication Technology Services, local 1195."),
    ("ustp_head_research", "Who is the head of the Research Office?",
     "Dr. Maricel C. Dalde is the Director of the Research Office and of the Institute of Continuing Education and Training (ICET), local 1138."),
    # Other offices
    ("ustp_head_hr", "Who is the head of Human Resource Management?",
     "Mr. Jerico Ian O. Guerrero is the Director of Human Resource Management, local 1120."),
    ("ustp_head_finance", "Who is the head of Financial Management Services?",
     "Ms. Cherry Ann S. Villarte, CPA, is the Director of Financial Management Services, local 1224 or 1166."),
    ("ustp_head_admin_mgmt", "Who is the head of Administrative Management Services?",
     "Mr. Jonathan O. Jacobo is the Director of Administrative Management Services, local 1142."),
    ("ustp_head_auxiliary", "Who is the head of Auxiliary Management Services?",
     "Engr. Edgem Lloyd S. Balabis is the Director of Auxiliary Management Services, local 1172."),
    ("ustp_head_laboratory", "Who is the head of Laboratory Management?",
     "Dr. Gina C. Lacang is the Director of Laboratory Management, local 1202."),
    ("ustp_head_planning", "Who is the head of Planning, Monitoring and Evaluation?",
     "Dr. Wendell D. Talampas is the Director of Planning, Monitoring and Evaluation, local 1108."),
    ("ustp_head_quality_assurance", "Who is the head of Quality Assurance and Accreditation?",
     "Mr. Laurence Marse B. Dagaraga is the Director of Quality Assurance and Accreditation, local 1117."),
    ("ustp_head_business_enterprise", "Who is the head of the Business Enterprise Division?",
     "Mr. Ralph Vendel E. Musni is the Director of the Business Enterprise Division, local 1113."),
    ("ustp_head_innovation", "Who is the head of Innovation and Technology Solutions?",
     "Engr. Alex L. Maureal is the Director of Innovation and Technology Solutions, local 1160."),
    ("ustp_head_incubator", "Who manages the technology business incubator (CDO b.i.t.e.s.)?",
     "Dr. Franch Maverick A. Lorilla manages Technology Business Incubation (CDO b.i.t.e.s.) and the USTP CDO Knowledge, Innovation, and Science Technology Park, local 1149."),
    # Scholarships and recognitions
    ("ustp_own_scholarships", "What scholarships does USTP itself offer?",
     "USTP's own scholarships are Entrance Scholarships, Academic Excellence, Leadership Scholarship, Grant-in-Aid for Minority, ARCU Scholarship, Athletic Scholarship, and NSTP-ROTC Scholarship. Ask the Admission and Scholarship Office for the requirements."),
    ("ustp_external_scholarships", "What outside scholarships can USTP students apply for?",
     "Grants: CHED Grant-in-Aid, CEPALCO Educational Assistance, ICTSI, NAPOLCOM, FAST Cooperative, NCIP, GSIS, and PESFA. Merit scholarships: CEPALCO, CHED, Del Monte Foundation, DBP RISE, DOST-SEI, PLDT-SMART Foundation, City Scholars, Lifebank Foundation, NGCP, Yokohama Tire, Rebisco Foundation, SM Foundation, and Philippine Sinter Corporation Foundation."),
    ("ustp_recognitions", "What recognitions does USTP have?",
     "USTP is a CHED Center of Excellence in Information Technology (the only one in Mindanao) and a Center of Development in Mathematics, Electrical Engineering and Agriculture. It has a QS 3-Star rating, ISO 9001:2015 certification, and Level IV state university status."),
    ("ustp_former_name", "What was USTP CDO called before?",
     "Before 2016, the Cagayan de Oro campus was the Mindanao University of Science and Technology (MUST). USTP was formed in 2016 by merging MUST with MOSCAT in Claveria."),
]

if __name__ == "__main__":
    rows = [
        {"intent_keyword": k, "question_text": q, "answer_content": a, "category": "General", "office_code": None}
        for k, q, a in FAQS
    ]
    assert len(rows) == 71 and len({r["intent_keyword"] for r in rows}) == 71
    out = Path(__file__).with_name("ustp_general_faqs.json")
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} FAQs to {out.name}")
