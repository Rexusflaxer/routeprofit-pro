export type CatalogItem = { kind: string; label: string; group: 'Beveiliging' | 'Brandveiligheid' | 'Ontruiming' | 'Gebouw'; color: string; shortcut?: string };
// Original LOQ vector illustrations; not licensed copies of standards symbols.
export const symbolCatalog: CatalogItem[] = [
 { kind:'camera',label:'Camera',group:'Beveiliging',color:'#3062b9'}, {kind:'motion_detector',label:'Bewegingsmelder',group:'Beveiliging',color:'#3062b9'}, {kind:'alarm_panel',label:'Alarmcentrale',group:'Beveiliging',color:'#3062b9'}, {kind:'access_control',label:'Toegangscontrole',group:'Beveiliging',color:'#3062b9'},
 {kind:'smoke_detector',label:'Brandmelder',group:'Brandveiligheid',color:'#d64239'}, {kind:'manual_call_point',label:'Handbrandmelder',group:'Brandveiligheid',color:'#d64239'}, {kind:'fire_extinguisher',label:'Brandblusser',group:'Brandveiligheid',color:'#d64239'}, {kind:'fire_hose',label:'Brandslanghaspel',group:'Brandveiligheid',color:'#d64239'},
 {kind:'aed',label:'AED',group:'Ontruiming',color:'#16805b'}, {kind:'emergency_exit',label:'Nooduitgang',group:'Ontruiming',color:'#16805b'}, {kind:'assembly_point',label:'Verzamelplaats',group:'Ontruiming',color:'#16805b'}, {kind:'you_are_here',label:'U bevindt zich hier',group:'Ontruiming',color:'#2563eb'}, {kind:'first_aid',label:'EHBO',group:'Ontruiming',color:'#16805b'},
 {kind:'stairs',label:'Trap',group:'Gebouw',color:'#66717c'}, {kind:'lift',label:'Lift',group:'Gebouw',color:'#66717c'}, {kind:'electrical',label:'Elektrakast',group:'Gebouw',color:'#ca961d'},
];
export const catalogItem = (kind: string) => symbolCatalog.find(item => item.kind === kind) || { kind, label: kind, group: 'Gebouw', color: '#66717c' };
const secondaryLabels: Record<string,Record<string,string>> = {
 en:{camera:'Camera',motion_detector:'Motion detector',alarm_panel:'Alarm panel',access_control:'Access control',smoke_detector:'Fire detector',manual_call_point:'Fire alarm call point',fire_extinguisher:'Fire extinguisher',fire_hose:'Fire hose reel',aed:'AED',emergency_exit:'Emergency exit',assembly_point:'Assembly point',you_are_here:'You are here',first_aid:'First aid',stairs:'Stairs',lift:'Lift',electrical:'Electrical cabinet'},
 de:{camera:'Kamera',motion_detector:'Bewegungsmelder',alarm_panel:'Alarmzentrale',access_control:'Zutrittskontrolle',smoke_detector:'Brandmelder',manual_call_point:'Handfeuermelder',fire_extinguisher:'Feuerlöscher',fire_hose:'Wandhydrant',aed:'AED',emergency_exit:'Notausgang',assembly_point:'Sammelstelle',you_are_here:'Ihr Standort',first_aid:'Erste Hilfe',stairs:'Treppe',lift:'Aufzug',electrical:'Elektroschrank'},
};
export const secondaryCatalogLabel = (kind:string,language:string) => secondaryLabels[language.toLowerCase().split('-')[0]]?.[kind] || '';
