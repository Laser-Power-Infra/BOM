import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

interface RuleGroup {
  category: string;
  threshold: number;
}

interface Mapping {
  mapA: string;
  mapB: string;
  output: string;
  ruleGroups: RuleGroup[];
}

function buildRules(groups: RuleGroup[]) {
  return groups.flatMap(({ category, threshold }) => [
    { category, label: `gt ${threshold}%`, value: String(threshold), operator: "gt" as const, output: "PLUS_PLUS" as const },
    { category, label: `lt -${threshold}%`, value: String(-threshold), operator: "lt" as const, output: "MINUS_MINUS" as const },
    { category, label: "gt 0%", value: "0", operator: "gt" as const, output: "PLUS" as const },
    { category, label: "lt 0%", value: "0", operator: "lt" as const, output: "MINUS" as const },
    { category, label: "eq 0%", value: "0", operator: "eq" as const, output: "ZERO" as const },
  ]);
}

const sharedAlloyRules: RuleGroup[] = [
  { category: "7 STRAND", threshold: 2 },
  { category: "13 STRAND", threshold: 2 },
  { category: "19 STRAND", threshold: 3 },
  { category: "37 STRAND", threshold: 3 },
  { category: "61 STRAND", threshold: 5 },
  { category: "BIG ABC", threshold: 5 },
  { category: "SMALL ABC", threshold: 5 },
  { category: "COVERED CONDUCTOR", threshold: 10 },
  { category: "HT ABC", threshold: 10 },
];

const sharedArmourRules: RuleGroup[] = [
  { category: "BIG POWER CABLE - ARD", threshold: 2 },
  { category: "SMALL POWER CABLE - ARD", threshold: 2 },
  { category: "CONTROL CABLE -ARD", threshold: 2 },
  { category: "HT POWER CABLE - ARD", threshold: 2 },
  { category: "RAILWAY-POWER CABLE -ARD", threshold: 2 },
  { category: "RAILWAY-SIGNALING CABLE -ARD", threshold: 2 },
  { category: "RAILWAY QUAD", threshold: 2 },
  { category: "SERVICE CABLES", threshold: 2 },
];

const sharedAlCuRules: RuleGroup[] = [
  { category: "7 STRAND", threshold: 2 },
  { category: "13 STRAND", threshold: 2 },
  { category: "19 STRAND", threshold: 3 },
  { category: "37 STRAND", threshold: 3 },
  { category: "61 STRAND", threshold: 5 },
  { category: "BIG ABC", threshold: 5 },
  { category: "SMALL ABC", threshold: 5 },
  { category: "RAILWAY-POWER CABLE -ARD", threshold: 2 },
  { category: "COVERED CONDUCTOR", threshold: 5 },
];

const sharedInsulationRules: RuleGroup[] = [
  { category: "BIG ABC", threshold: 5 },
  { category: "SMALL ABC", threshold: 5 },
  { category: "RAILWAY-POWER CABLE -ARD", threshold: 2 },
  { category: "COVERED CONDUCTOR", threshold: 5 },
  { category: "HT POWER CABLE - ARD", threshold: 5 },
  { category: "SMALL POWER CABLE - ARD", threshold: 2 },
  { category: "1 CORE BIG POWER CABLE - UNARD", threshold: 3 },
  { category: "CONTROL CABLE -ARD", threshold: 5 },
  { category: "BIG POWER CABLE - ARD", threshold: 2.5 },
  { category: "1 CORE BIG POWER CABLE - ARD", threshold: 2.5 },
  { category: "1 CORE SMALL POWER CABLE - UNARD", threshold: 3.5 },
  { category: "SERVICE CABLES", threshold: 3 },
  { category: "HT ABC", threshold: 3 },
  { category: "RAILWAY-SIGNALING CABLE -ARD", threshold: 5 },
];

const sharedSemiconRules: RuleGroup[] = [
  { category: "HT POWER CABLE - ARD", threshold: 2 },
  { category: "HT POWER CABLE -UNARD", threshold: 5 },
  { category: "HT ABC", threshold: 5 },
  { category: "COVERED CONDUCTOR", threshold: 5 },
];

const mappings: Mapping[] = [
  {
    mapA: "ALLOY WIRE ROD (AL-59)",
    mapB: "AL ALLOY",
    output: "alloy",
    ruleGroups: sharedAlloyRules,
  },
  {
    mapA: "ALLOY WIRE ROD (AL-7)",
    mapB: "AL ALLOY",
    output: "alloy",
    ruleGroups: sharedAlloyRules,
  },
  {
    mapA: "ALLOY WIRE ROD T4 (6201)",
    mapB: "AL ALLOY",
    output: "alloy",
    ruleGroups: sharedAlloyRules,
  },
  {
    mapA: "ALLOY WIRE ROD T4 (6201) (CG)",
    mapB: "AL ALLOY",
    output: "alloy",
    ruleGroups: sharedAlloyRules,
  },
  {
    mapA: "ALLOY WIRE ROD T6 (6061)",
    mapB: "AL ALLOY",
    output: "alloy",
    ruleGroups: sharedAlloyRules,
  },
  {
    mapA: "Aluminium STRIP",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "Aluminium Tape",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "Aluminium Wire Rod",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "Aluminum Clad Steel Wires 3.35 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "Aluminum Clad Steel Wires 4.09 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "Aluminum Clad Steel Wires 4.72 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL STRIP 4*0.60 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL STRIP 4*0.80 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL STRIP 4*0.80 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL STRIP 6.10*1.40 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 25*0.30 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 25*0.46 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 32*0.60 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 35*0.20 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 35*0.30 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 35*0.50 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 35*0.60 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 35*0.80 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL TAPE 50*0.50 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.40 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.40 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.44 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.57 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.57 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.60 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.60 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.67 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 1.90 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.00 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.11 MM (CG)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.11 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.16 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.21 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.30 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.36 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.41 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.48 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.50 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.51 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.54 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.59 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.59 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.63 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.68 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.70 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.76 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.79 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.80 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.89 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 2.90 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.00 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.05 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.09 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.10 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.15 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.18 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.35 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.35 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.45 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.47 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.50 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.53 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.60 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.66 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 3.71 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.00 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.00 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.09 MM (IS)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.09 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.14 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.17 MM (N)",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.30 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.72 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "STEEL WIRE 4.78 MM",
    mapB: "Armouring",
    output: "armour",
    ruleGroups: sharedArmourRules,
  },
  {
    mapA: "ANNEALED COPPER 2.16 MM",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "ANNEALED COPPER 2.8 MM",
    mapB: "AL/CU WT.",
    output: "alCu",
    
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Rod",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Wire",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Tin Copper 0.411",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "TIN COPPER 0.504",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Tin Copper 0.67",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "TIN COPPER 0.797",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "TIN COPPER 0.972",
    mapB: "AL/CU WT.",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Tape - 50 X 0.030 MM",
    mapB: "Copper Tape - 0.03 mm",
    output: "alCu",
    
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Tape - 50 X 0.040 MM",
    mapB: "Copper Tape - 0.04 mm",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Tape - 50 X 0.045 MM",
    mapB: "Copper Tape - 0.045 mm",
    output: "alCu", //cuTape
    outputText: "CT-0.045",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Tape - 50 X 0.050 MM",
    mapB: "Copper Tape - 0.050 mm",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "Copper Tape - 50 X 0.060 MM",
    mapB: "Copper Tape - 0.060 mm",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "COPPER TAPE - 50 X 0.10 MM",
    mapB: "Copper Tape -50X0.10",
    output: "alCu",
    ruleGroups: sharedAlCuRules,
  },
  {
    mapA: "FR RP PVC BLACK 1.45",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "FRLSH PVC ST - 2",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "GLASS FIBER TAPE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "GLASS FIBER TAPE (65 * 0.12)",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND (B)",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND (QUAD)",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND (QUAD) (CLOSED)",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB BLACK",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB BLUE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB BROWN",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB GREEN",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB GREY",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB ORANGE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB RED",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB WHITE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HDPE COMPOUND MB YELLOW",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "HT XLPE SIOPLASS",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "LDPE COMPOUND",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "LLDPE - 2 MFI",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "LLDPE - 50 MFI",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "LT XLPE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND 1.38",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND 1.48",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND 1.52 (ATR)",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND 1.60",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND FRLS ST2",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND MB BLACK INSULATION",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND MB BLUE",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND MB GREY INSULATION",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND MB RED",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC COMPOUND MB YELLOW",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "PVC FLRSH ATR",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "RED UV RESISTANT NON TRACKING AND ERPSION RESISTAN LT XLPE COMPOUND",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "XLPE CCV",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "XLPE CCV-TR",
    mapB: "Insu. - type (xlpe/pvc)",
    output: "insulation",
    ruleGroups: sharedInsulationRules,
  },
  {
    mapA: "Semi Con - CCV",
    mapB: "semicon",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "SEMI CONDUCTING TAPE 50 X 0.12 MM",
    mapB: "SEMICON TAPE",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "SEMI CONDUCTING TAPE 50 X 0.30 MM",
    mapB: "SEMICON TAPE",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "SEMI CONDUCTIVE WATER SWELLABLE TAPE (CLOSED)",
    mapB: "Semi conducting Water Swellable tape",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "SEMI CONDUCTIVE WATER SWELLABLE TAPE 50 * 0.30 MM",
    mapB: "Semi conducting Water Swellable tape",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "SEMICON SIOPLASS",
    mapB: "semicon",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "2MM SEMICONDUCTIVE WATER SWELLABLE YARN",
    mapB: "Semi conducting Water Swellable tape",
    output: "semicon",
    ruleGroups: sharedSemiconRules,
  },
  {
    mapA: "PP FILLER",
    mapB: "FILLER",
    output: "filler",
    ruleGroups: [],
  },
  {
    mapA: "PP FILLER - 18 MM",
    mapB: "FILLER",
    output: "filler",
    ruleGroups: [],
  },
  {
    mapA: "PP FILLER - 9 MM",
    mapB: "FILLER",
    output: "filler",
    ruleGroups: [],
  },
  {
    mapA: "PVC FILLER",
    mapB: "FILLER",
    output: "filler",
    ruleGroups: [],
  },
];

async function main() {
  await prisma.rule.deleteMany();
  await prisma.map.deleteMany();

  for (const m of mappings) {
    const created = await prisma.map.create({
      data: {
        mapA: m.mapA,
        mapB: m.mapB,
        output: m.output,
        Rules: {
          create: buildRules(m.ruleGroups),
        },
      },
      include: { Rules: true },
    });
    console.log(`Created map: ${m.mapA} → ${m.mapB} → ${m.output} with ${created.Rules.length} rules`);
  }

  console.log(`\nSeeded ${mappings.length} maps successfully`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
