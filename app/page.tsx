"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, Calculator, Zap, Download } from "lucide-react"

interface RFStage {
  id: string
  name: string
  gain: number // dB
  noiseFigure: number // dB
  p1db: number // dBm
  ip3: number // dBm
}

interface CascadeResults {
  totalGain: number
  totalNoiseFigure: number
  totalP1db: number
  totalIP3: number
  sfdr: number
}

interface PowerConversions {
  dbToDbm: { db: number; referenceDbm: number; result: number }
  dbmToWatts: { dbm: number; result: number }
  wattsToDbm: { watts: number; result: number }
  wattsToDb: { watts: number; referenceWatts: number; result: number }
}

export default function RFCascadeCalculator() {
  const [stages, setStages] = useState<RFStage[]>([
    {
      id: "1",
      name: "LNA",
      gain: 20,
      noiseFigure: 1.5,
      p1db: 10,
      ip3: 20,
    },
  ])

  const [results, setResults] = useState<CascadeResults | null>(null)

  const [powerConversions, setPowerConversions] = useState<PowerConversions>({
    dbToDbm: { db: 0, referenceDbm: 0, result: 0 },
    dbmToWatts: { dbm: 0, result: 0 },
    wattsToDbm: { watts: 0.001, result: 0 },
    wattsToDb: { watts: 0.001, referenceWatts: 0.001, result: 0 },
  })

  const convertDbToDbm = (db: number, referenceDbm: number) => {
    return db + referenceDbm
  }

  const convertDbmToWatts = (dbm: number) => {
    return Math.pow(10, (dbm - 30) / 10)
  }

  const convertWattsToDbm = (watts: number) => {
    return 10 * Math.log10(watts * 1000)
  }

  const convertWattsToDb = (watts: number, referenceWatts: number) => {
    return 10 * Math.log10(watts / referenceWatts)
  }

  const updatePowerConversion = (type: keyof PowerConversions, field: string, value: number) => {
    setPowerConversions((prev) => {
      const updated = { ...prev }
      const conversion = { ...updated[type] }

      // @ts-ignore
      conversion[field] = value

      // Calculate result based on type
      switch (type) {
        case "dbToDbm":
          conversion.result = convertDbToDbm(conversion.db, conversion.referenceDbm)
          break
        case "dbmToWatts":
          conversion.result = convertDbmToWatts(conversion.dbm)
          break
        case "wattsToDbm":
          conversion.result = convertWattsToDbm(conversion.watts)
          break
        case "wattsToDb":
          conversion.result = convertWattsToDb(conversion.watts, conversion.referenceWatts)
          break
      }

      updated[type] = conversion
      return updated
    })
  }

  const addStage = () => {
    const newStage: RFStage = {
      id: Date.now().toString(),
      name: `Stage ${stages.length + 1}`,
      gain: 0,
      noiseFigure: 0,
      p1db: 0,
      ip3: 0,
    }
    setStages([...stages, newStage])
  }

  const removeStage = (id: string) => {
    setStages(stages.filter((stage) => stage.id !== id))
  }

  const updateStage = (id: string, field: keyof RFStage, value: string | number) => {
    setStages(stages.map((stage) => (stage.id === id ? { ...stage, [field]: value } : stage)))
  }

  const calculateCascade = () => {
    if (stages.length === 0) return

    // Total Gain (simple sum in dB)
    const totalGain = stages.reduce((sum, stage) => sum + stage.gain, 0)

    // Cascaded Noise Figure using Friis formula
    let totalNoiseFigure = stages[0].noiseFigure
    let cumulativeGain = stages[0].gain

    for (let i = 1; i < stages.length; i++) {
      const nfLinear = Math.pow(10, stages[i].noiseFigure / 10)
      const gainLinear = Math.pow(10, cumulativeGain / 10)
      const currentNfLinear = Math.pow(10, totalNoiseFigure / 10)

      const newNfLinear = currentNfLinear + (nfLinear - 1) / gainLinear
      totalNoiseFigure = 10 * Math.log10(newNfLinear)
      cumulativeGain += stages[i].gain
    }

    // Cascaded P1dB (referred to input)
    let totalP1db = stages[0].p1db
    let gainAccumulator = 0

    for (let i = 1; i < stages.length; i++) {
      gainAccumulator += stages[i - 1].gain
      const referredP1db = stages[i].p1db - gainAccumulator
      totalP1db = Math.min(totalP1db, referredP1db)
    }

    // Cascaded IP3 (referred to input)
    let totalIP3 = stages[0].ip3
    gainAccumulator = 0

    for (let i = 1; i < stages.length; i++) {
      gainAccumulator += stages[i - 1].gain
      const referredIP3 = stages[i].ip3 - gainAccumulator

      // Convert to linear, add reciprocals, convert back
      const ip3Linear1 = Math.pow(10, totalIP3 / 10)
      const ip3Linear2 = Math.pow(10, referredIP3 / 10)
      const combinedLinear = 1 / (1 / ip3Linear1 + 1 / ip3Linear2)
      totalIP3 = 10 * Math.log10(combinedLinear)
    }

    // SFDR Calculation
    const sfdr = Math.round((((totalIP3 - totalNoiseFigure - -174) * 2) / 3) * 100) / 100

    setResults({
      totalGain: Math.round(totalGain * 100) / 100,
      totalNoiseFigure: Math.round(totalNoiseFigure * 100) / 100,
      totalP1db: Math.round(totalP1db * 100) / 100,
      totalIP3: Math.round(totalIP3 * 100) / 100,
      sfdr: sfdr,
    })
  }

  const generatePDF = async () => {
    if (!results) {
      alert("Please calculate cascade results first!")
      return
    }

    // Dynamic import to avoid SSR issues
    const jsPDF = (await import("jspdf")).default

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const margin = 20
    let yPosition = 20

    // Title
    doc.setFontSize(20)
    doc.setFont("helvetica", "bold")
    doc.text("RF Cascade Calculator Results", pageWidth / 2, yPosition, { align: "center" })
    yPosition += 20

    // Date and time
    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    const now = new Date()
    doc.text(`Generated: ${now.toLocaleString()}`, pageWidth / 2, yPosition, { align: "center" })
    yPosition += 20

    // Input Stages Section
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("Input Stages", margin, yPosition)
    yPosition += 15

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")

    // Table headers
    const headers = ["Stage", "Name", "Gain (dB)", "NF (dB)", "P1dB (dBm)", "IP3 (dBm)"]
    const colWidths = [20, 40, 25, 25, 25, 25]
    let xPosition = margin

    doc.setFont("helvetica", "bold")
    headers.forEach((header, i) => {
      doc.text(header, xPosition, yPosition)
      xPosition += colWidths[i]
    })
    yPosition += 10

    // Draw line under headers
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2)
    yPosition += 5

    // Stage data
    doc.setFont("helvetica", "normal")
    stages.forEach((stage, index) => {
      xPosition = margin
      const rowData = [
        `${index + 1}`,
        stage.name,
        stage.gain.toString(),
        stage.noiseFigure.toString(),
        stage.p1db.toString(),
        stage.ip3.toString(),
      ]

      rowData.forEach((data, i) => {
        doc.text(data, xPosition, yPosition)
        xPosition += colWidths[i]
      })
      yPosition += 8
    })

    yPosition += 15

    // Results Section
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("Calculated Results", margin, yPosition)
    yPosition += 15

    doc.setFontSize(12)
    doc.setFont("helvetica", "normal")

    const resultData = [
      ["Total Gain:", `${results.totalGain} dB`],
      ["Cascaded Noise Figure:", `${results.totalNoiseFigure} dB`],
      ["Cascaded P1dB:", `${results.totalP1db} dBm`],
      ["Cascaded IP3:", `${results.totalIP3} dBm`],
      ["SFDR (2/3 slope):", `${results.sfdr} dB`],
    ]

    resultData.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, margin, yPosition)
      doc.setFont("helvetica", "normal")
      doc.text(value, margin + 60, yPosition)
      yPosition += 10
    })

    yPosition += 15

    // Power Conversions Section
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("Power Conversions", margin, yPosition)
    yPosition += 15

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")

    const powerData = [
      [
        "dB to dBm:",
        `${powerConversions.dbToDbm.db} dB + ${powerConversions.dbToDbm.referenceDbm} dBm = ${powerConversions.dbToDbm.result.toFixed(2)} dBm`,
      ],
      [
        "dBm to Watts:",
        `${powerConversions.dbmToWatts.dbm} dBm = ${powerConversions.dbmToWatts.result >= 1 ? `${powerConversions.dbmToWatts.result.toFixed(6)} W` : powerConversions.dbmToWatts.result >= 0.001 ? `${(powerConversions.dbmToWatts.result * 1000).toFixed(3)} mW` : `${(powerConversions.dbmToWatts.result * 1000000).toFixed(3)} μW`}`,
      ],
      [
        "Watts to dBm:",
        `${powerConversions.wattsToDbm.watts} W = ${powerConversions.wattsToDbm.result.toFixed(2)} dBm`,
      ],
      [
        "Watts to dB:",
        `${powerConversions.wattsToDb.watts} W / ${powerConversions.wattsToDb.referenceWatts} W = ${powerConversions.wattsToDb.result.toFixed(2)} dB`,
      ],
    ]

    powerData.forEach(([label, calculation]) => {
      doc.setFont("helvetica", "bold")
      doc.text(label, margin, yPosition)
      doc.setFont("helvetica", "normal")
      doc.text(calculation, margin + 5, yPosition + 8)
      yPosition += 18
    })

    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage()
      yPosition = 20
    }

    yPosition += 10

    // Detailed Calculations Section
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("Detailed Calculations", margin, yPosition)
    yPosition += 15

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")

    // Gain calculation
    doc.setFont("helvetica", "bold")
    doc.text("1. Total Gain Calculation:", margin, yPosition)
    yPosition += 8
    doc.setFont("helvetica", "normal")
    const gainCalc = stages.map((stage, i) => `Stage ${i + 1}: ${stage.gain} dB`).join(" + ")
    doc.text(`${gainCalc} = ${results.totalGain} dB`, margin + 5, yPosition)
    yPosition += 15

    // Noise Figure calculation
    doc.setFont("helvetica", "bold")
    doc.text("2. Cascaded Noise Figure (Friis Formula):", margin, yPosition)
    yPosition += 8
    doc.setFont("helvetica", "normal")
    doc.text("F_total = F1 + (F2-1)/G1 + (F3-1)/(G1*G2) + ...", margin + 5, yPosition)
    yPosition += 8
    doc.text(`Result: ${results.totalNoiseFigure} dB`, margin + 5, yPosition)
    yPosition += 15

    // P1dB calculation
    doc.setFont("helvetica", "bold")
    doc.text("3. Cascaded P1dB Calculation:", margin, yPosition)
    yPosition += 8
    doc.setFont("helvetica", "normal")
    doc.text("Minimum of all stages referred to input", margin + 5, yPosition)
    yPosition += 8
    doc.text(`Result: ${results.totalP1db} dBm`, margin + 5, yPosition)
    yPosition += 15

    // IP3 calculation
    doc.setFont("helvetica", "bold")
    doc.text("4. Cascaded IP3 Calculation:", margin, yPosition)
    yPosition += 8
    doc.setFont("helvetica", "normal")
    doc.text("1/IP3_total = 1/IP3_1 + 1/(IP3_2/G1) + ...", margin + 5, yPosition)
    yPosition += 8
    doc.text(`Result: ${results.totalIP3} dBm`, margin + 5, yPosition)
    yPosition += 15

    // SFDR calculation
    doc.setFont("helvetica", "bold")
    doc.text("5. SFDR Calculation:", margin, yPosition)
    yPosition += 8
    doc.setFont("helvetica", "normal")
    doc.text("SFDR = (2/3) * (IP3 - NF - kTB)", margin + 5, yPosition)
    yPosition += 8
    doc.text(`SFDR = (2/3) * (${results.totalIP3} - ${results.totalNoiseFigure} - (-174))`, margin + 5, yPosition)
    yPosition += 8
    doc.text(`Result: ${results.sfdr} dB`, margin + 5, yPosition)

    // Save the PDF
    doc.save(`RF_Cascade_Results_${now.toISOString().split("T")[0]}.pdf`)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">RF Cascade Calculator</h1>
          <p className="text-muted-foreground">
            Calculate cascaded gain, noise figure, P1dB, IP3 and power conversions for RF systems
          </p>
        </div>

        {results && (
          <div className="flex justify-center">
            <Button onClick={generatePDF} className="flex items-center gap-2" size="lg">
              <Download className="w-5 h-5" />
              Download PDF Report
            </Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Power Conversions
            </CardTitle>
            <CardDescription>Convert between dB, dBm, and Watts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* dB to dBm */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">dB to dBm</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="db-input" className="text-xs">
                      dB Value
                    </Label>
                    <Input
                      id="db-input"
                      type="number"
                      step="0.1"
                      value={powerConversions.dbToDbm.db}
                      onChange={(e) => updatePowerConversion("dbToDbm", "db", Number.parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ref-dbm" className="text-xs">
                      Reference (dBm)
                    </Label>
                    <Input
                      id="ref-dbm"
                      type="number"
                      step="0.1"
                      value={powerConversions.dbToDbm.referenceDbm}
                      onChange={(e) =>
                        updatePowerConversion("dbToDbm", "referenceDbm", Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <span className="font-mono font-bold">{powerConversions.dbToDbm.result.toFixed(2)} dBm</span>
                  </div>
                </div>
              </div>

              {/* dBm to Watts */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">dBm to Watts</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="dbm-input" className="text-xs">
                      dBm Value
                    </Label>
                    <Input
                      id="dbm-input"
                      type="number"
                      step="0.1"
                      value={powerConversions.dbmToWatts.dbm}
                      onChange={(e) =>
                        updatePowerConversion("dbmToWatts", "dbm", Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <span className="font-mono font-bold">
                      {powerConversions.dbmToWatts.result >= 1
                        ? `${powerConversions.dbmToWatts.result.toFixed(3)} W`
                        : powerConversions.dbmToWatts.result >= 0.001
                          ? `${(powerConversions.dbmToWatts.result * 1000).toFixed(3)} mW`
                          : `${(powerConversions.dbmToWatts.result * 1000000).toFixed(3)} μW`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Watts to dBm */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Watts to dBm</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="watts-input" className="text-xs">
                      Watts Value
                    </Label>
                    <Input
                      id="watts-input"
                      type="number"
                      step="0.001"
                      value={powerConversions.wattsToDbm.watts}
                      onChange={(e) =>
                        updatePowerConversion("wattsToDbm", "watts", Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <span className="font-mono font-bold">{powerConversions.wattsToDbm.result.toFixed(2)} dBm</span>
                  </div>
                </div>
              </div>

              {/* Watts to dB */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Watts to dB</h4>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="watts-db-input" className="text-xs">
                      Watts Value
                    </Label>
                    <Input
                      id="watts-db-input"
                      type="number"
                      step="0.001"
                      value={powerConversions.wattsToDb.watts}
                      onChange={(e) =>
                        updatePowerConversion("wattsToDb", "watts", Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="ref-watts" className="text-xs">
                      Reference (W)
                    </Label>
                    <Input
                      id="ref-watts"
                      type="number"
                      step="0.001"
                      value={powerConversions.wattsToDb.referenceWatts}
                      onChange={(e) =>
                        updatePowerConversion("wattsToDb", "referenceWatts", Number.parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="p-2 bg-muted rounded text-center">
                    <span className="font-mono font-bold">{powerConversions.wattsToDb.result.toFixed(2)} dB</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Stages */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">RF Stages</h2>
              <Button onClick={addStage} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Stage
              </Button>
            </div>

            <div className="space-y-4">
              {stages.map((stage, index) => (
                <Card key={stage.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Stage {index + 1}</Badge>
                        <Input
                          value={stage.name}
                          onChange={(e) => updateStage(stage.id, "name", e.target.value)}
                          className="w-32 h-8"
                          placeholder="Stage name"
                        />
                      </div>
                      {stages.length > 1 && (
                        <Button variant="outline" size="sm" onClick={() => removeStage(stage.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`gain-${stage.id}`}>Gain (dB)</Label>
                        <Input
                          id={`gain-${stage.id}`}
                          type="number"
                          step="0.1"
                          value={stage.gain}
                          onChange={(e) => updateStage(stage.id, "gain", Number.parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`nf-${stage.id}`}>NF (dB)</Label>
                        <Input
                          id={`nf-${stage.id}`}
                          type="number"
                          step="0.1"
                          value={stage.noiseFigure}
                          onChange={(e) => updateStage(stage.id, "noiseFigure", Number.parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`p1db-${stage.id}`}>P1dB (dBm)</Label>
                        <Input
                          id={`p1db-${stage.id}`}
                          type="number"
                          step="0.1"
                          value={stage.p1db}
                          onChange={(e) => updateStage(stage.id, "p1db", Number.parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`ip3-${stage.id}`}>IP3 (dBm)</Label>
                        <Input
                          id={`ip3-${stage.id}`}
                          type="number"
                          step="0.1"
                          value={stage.ip3}
                          onChange={(e) => updateStage(stage.id, "ip3", Number.parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button onClick={calculateCascade} className="w-full flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Calculate Cascade
            </Button>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Results</h2>

            {results ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Total Gain</CardTitle>
                    <CardDescription>Sum of all stage gains</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{results.totalGain} dB</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Cascaded NF</CardTitle>
                    <CardDescription>Using Friis formula</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{results.totalNoiseFigure} dB</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Cascaded P1dB</CardTitle>
                    <CardDescription>Referred to input</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{results.totalP1db} dBm</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Cascaded IP3</CardTitle>
                    <CardDescription>Referred to input</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{results.totalIP3} dBm</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Dynamic Range</CardTitle>
                    <CardDescription>SFDR (2/3 slope)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{results.sfdr} dB</div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Click "Calculate Cascade" to see results</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Formula Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Formula Reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Cascaded Noise Figure (Friis)</h4>
                <p className="font-mono bg-muted p-2 rounded">
                  {"$$F_{total} = F_1 + \\frac{F_2-1}{G_1} + \\frac{F_3-1}{G_1 \\times G_2} + \\ldots$$"}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Cascaded IP3</h4>
                <p className="font-mono bg-muted p-2 rounded">
                  {"$$\\frac{1}{IP3_{total}} = \\frac{1}{IP3_1} + \\frac{1}{IP3_2/G_1} + \\ldots$$"}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Cascaded P1dB</h4>
                <p className="text-muted-foreground">Minimum of all stages referred to input</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">SFDR (2/3 slope)</h4>
                <p className="font-mono bg-muted p-2 rounded">{"$$SFDR = \\frac{2}{3}(IP3 - NF - kTB)$$"}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Power Conversions</h4>
                <div className="space-y-1 text-xs">
                  <p className="font-mono bg-muted p-1 rounded">dBm = 10×log₁₀(P_mW)</p>
                  <p className="font-mono bg-muted p-1 rounded">P_W = 10^((dBm-30)/10)</p>
                  <p className="font-mono bg-muted p-1 rounded">dB = 10×log₁₀(P/P_ref)</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
