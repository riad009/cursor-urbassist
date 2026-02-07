import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload PDF, DOC, DOCX, or TXT files." },
        { status: 400 }
      )
    }

    // For demo purposes, extract text content
    // In production, use a proper PDF parsing library like pdf-parse
    let textContent = ""

    if (file.type === "text/plain") {
      textContent = await file.text()
    } else {
      // Mock extraction for PDF/DOC files
      textContent = `
PLU Document: ${file.name}
Zone: UB - Zone Urbaine Mixte

ARTICLE UB 1 - OCCUPATIONS ET UTILISATIONS DU SOL INTERDITES
Sont interdits:
- Les constructions à usage industriel
- Les installations classées pour la protection de l'environnement
- Les dépôts de véhicules

ARTICLE UB 2 - OCCUPATIONS ET UTILISATIONS DU SOL SOUMISES À CONDITIONS
Sont admis sous conditions:
- Les constructions à usage d'habitation
- Les constructions à usage de bureaux et services
- Les commerces de proximité

ARTICLE UB 3 - CONDITIONS DE DESSERTE ET D'ACCÈS
L'accès doit avoir une largeur minimale de 3,50 mètres.

ARTICLE UB 4 - CONDITIONS DE DESSERTE PAR LES RÉSEAUX
Toute construction doit être raccordée aux réseaux publics.

ARTICLE UB 5 - SUPERFICIE MINIMALE DES TERRAINS
Non réglementé.

ARTICLE UB 6 - IMPLANTATION DES CONSTRUCTIONS PAR RAPPORT AUX VOIES
Recul minimum de 5 mètres par rapport à l'alignement.

ARTICLE UB 7 - IMPLANTATION DES CONSTRUCTIONS PAR RAPPORT AUX LIMITES SÉPARATIVES
Retrait minimum de 3 mètres ou construction en limite.

ARTICLE UB 8 - IMPLANTATION DES CONSTRUCTIONS LES UNES PAR RAPPORT AUX AUTRES
Distance minimale de 4 mètres entre deux bâtiments non contigus.

ARTICLE UB 9 - EMPRISE AU SOL
Le coefficient d'emprise au sol (CES) est fixé à 40%.

ARTICLE UB 10 - HAUTEUR MAXIMALE DES CONSTRUCTIONS
La hauteur maximale est fixée à 12 mètres à l'égout du toit.

ARTICLE UB 11 - ASPECT EXTÉRIEUR DES CONSTRUCTIONS
Les constructions doivent s'intégrer harmonieusement dans le paysage urbain.
Toitures: pente comprise entre 30° et 45°.
Façades: enduit, pierre ou bois.

ARTICLE UB 12 - STATIONNEMENT
1 place de stationnement par tranche de 60 m² de surface de plancher.

ARTICLE UB 13 - ESPACES LIBRES ET PLANTATIONS
Minimum 20% de la surface du terrain doit être aménagée en espaces verts.
      `.trim()
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      size: file.size,
      type: file.type,
      content: textContent,
    })
  } catch (error) {
    console.error("Document upload error:", error)
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    )
  }
}
