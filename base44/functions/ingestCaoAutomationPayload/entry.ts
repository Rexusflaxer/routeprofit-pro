import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Owner-only CAO ingest endpoint.
// Called by Cloudflare cao-automation-relay after owner approval in Codex.
// Auth: Authorization: Bearer <CAO_AUTOMATION_SHARED_SECRET>
// All customer user auth is ignored for mutations — secret-only gate.

const PAYROLL_CRITICAL_DOMAINS = [
  'payroll', 'wage', 'wages', 'salary', 'loon', 'loontabel', 'allowance',
  'allowances', 'reimbursement', 'toeslag', 'surcharge', 'overtime',
  'overwerk', 'planning', 'schedule', 'rooster', 'contract', 'employment',
  'probation', 'proeftijd', 'dismissal', 'termination', 'opzegging',
  'leave', 'vacation', 'holiday', 'sickness', 'ziekte', 'pension', 'fund',
  'function_classification', 'classification', 'bijlage_2'
];

const CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS = {
  total: 2110,
  automatic_or_calculation: 852,
  validation_or_policy: 90,
  workflow_or_documentation: 84
};

const LOCAL_RUNTIME_RULE_BINDINGS = {
  'resolveCaoApplicability.article_3_scope': {
    functions: ['resolveCaoApplicability', 'calculatePersonnelCosts', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0227', 'CAO-PB-2024-R0228', 'CAO-PB-2024-R0229',
      'CAO-PB-2024-R0230', 'CAO-PB-2024-R0231', 'CAO-PB-2024-R0232',
      'CAO-PB-2024-R0233'
    ]
  },
  'applyCaoContractRules.probation_and_probation_dismissal': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0315', 'CAO-PB-2024-R0316', 'CAO-PB-2024-R0317',
      'CAO-PB-2024-R0321', 'CAO-PB-2024-R0322'
    ]
  },
  'applyCaoContractRules.fulltime_parttime_contract_model_articles_10_11': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0309', 'CAO-PB-2024-R0310',
      'CAO-PB-2024-R0337', 'CAO-PB-2024-R0339',
      'CAO-PB-2024-R0342', 'CAO-PB-2024-R0343',
      'CAO-PB-2024-R0345', 'CAO-PB-2024-R0347',
      'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359'
    ]
  },
  'applyCaoContractRules.parttime_workload_change_articles_11_12': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0349', 'CAO-PB-2024-R0350', 'CAO-PB-2024-R0351',
      'CAO-PB-2024-R0352', 'CAO-PB-2024-R0353', 'CAO-PB-2024-R0354',
      'CAO-PB-2024-R0355', 'CAO-PB-2024-R0356', 'CAO-PB-2024-R0357',
      'CAO-PB-2024-R0358', 'CAO-PB-2024-R0359', 'CAO-PB-2024-R0360',
      'CAO-PB-2024-R0361', 'CAO-PB-2024-R0362', 'CAO-PB-2024-R0363',
      'CAO-PB-2024-R0364', 'CAO-PB-2024-R0365', 'CAO-PB-2024-R0367',
      'CAO-PB-2024-R0368', 'CAO-PB-2024-R0369'
    ]
  },
  'applyCaoContractRules.contract_clauses_and_termination_article_9': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0236', 'CAO-PB-2024-R0311',
      'CAO-PB-2024-R0323', 'CAO-PB-2024-R0324', 'CAO-PB-2024-R0325',
      'CAO-PB-2024-R0326', 'CAO-PB-2024-R0327', 'CAO-PB-2024-R0328',
      'CAO-PB-2024-R0329', 'CAO-PB-2024-R0330', 'CAO-PB-2024-R0331',
      'CAO-PB-2024-R0332', 'CAO-PB-2024-R0333', 'CAO-PB-2024-R0334',
      'CAO-PB-2024-R0335'
    ]
  },
  'applyCaoContractRules.call_agreement_article_13': {
    functions: ['applyCaoContractRules'],
    rule_ids: [
      'CAO-PB-2024-R0372', 'CAO-PB-2024-R0373', 'CAO-PB-2024-R0374',
      'CAO-PB-2024-R0377', 'CAO-PB-2024-R0378', 'CAO-PB-2024-R0380',
      'CAO-PB-2024-R0387', 'CAO-PB-2024-R0388', 'CAO-PB-2024-R0389',
      'CAO-PB-2024-R0390', 'CAO-PB-2024-R0391', 'CAO-PB-2024-R0392',
      'CAO-PB-2024-R0393', 'CAO-PB-2024-R0394', 'CAO-PB-2024-R0396',
      'CAO-PB-2024-R0397', 'CAO-PB-2024-R0398', 'CAO-PB-2024-R0399'
    ]
  },
  'applyCaoContractRules.internship_article_14': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules'],
    rule_ids: [
      'CAO-PB-2024-R0401', 'CAO-PB-2024-R0402', 'CAO-PB-2024-R0403',
      'CAO-PB-2024-R0404', 'CAO-PB-2024-R0405', 'CAO-PB-2024-R0407',
      'CAO-PB-2024-R0408', 'CAO-PB-2024-R0409', 'CAO-PB-2024-R0410',
      'CAO-PB-2024-R0411', 'CAO-PB-2024-R0412', 'CAO-PB-2024-R0414',
      'CAO-PB-2024-R0415', 'CAO-PB-2024-R0417', 'CAO-PB-2024-R0418',
      'CAO-PB-2024-R0419', 'CAO-PB-2024-R0420', 'CAO-PB-2024-R0421',
      'CAO-PB-2024-R0422'
    ]
  },
  'applyCaoContractRules.hired_worker_article_15': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0423', 'CAO-PB-2024-R0424', 'CAO-PB-2024-R0425',
      'CAO-PB-2024-R0426', 'CAO-PB-2024-R0427', 'CAO-PB-2024-R0428',
      'CAO-PB-2024-R0429', 'CAO-PB-2024-R0430', 'CAO-PB-2024-R0431',
      'CAO-PB-2024-R0432', 'CAO-PB-2024-R0433', 'CAO-PB-2024-R0434',
      'CAO-PB-2024-R0435', 'CAO-PB-2024-R0436', 'CAO-PB-2024-R0437',
      'CAO-PB-2024-R0438'
    ]
  },
  'applyCaoContractRules.suspension_article_16': {
    functions: ['applyCaoContractRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0445', 'CAO-PB-2024-R0446',
      'CAO-PB-2024-R0447', 'CAO-PB-2024-R0448', 'CAO-PB-2024-R0451'
    ]
  },
  'applyCaoContractRules.contract_transfer_articles_18_20': {
    functions: ['applyCaoContractRules', 'resolvePersonnelContractForService', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0464', 'CAO-PB-2024-R0465', 'CAO-PB-2024-R0466',
      'CAO-PB-2024-R0467', 'CAO-PB-2024-R0468', 'CAO-PB-2024-R0469',
      'CAO-PB-2024-R0470', 'CAO-PB-2024-R0471', 'CAO-PB-2024-R0472',
      'CAO-PB-2024-R0473', 'CAO-PB-2024-R0474', 'CAO-PB-2024-R0475',
      'CAO-PB-2024-R0476', 'CAO-PB-2024-R0477', 'CAO-PB-2024-R0478',
      'CAO-PB-2024-R0479', 'CAO-PB-2024-R0480', 'CAO-PB-2024-R0481',
      'CAO-PB-2024-R0482', 'CAO-PB-2024-R0483', 'CAO-PB-2024-R0484',
      'CAO-PB-2024-R0485', 'CAO-PB-2024-R0486', 'CAO-PB-2024-R0487',
      'CAO-PB-2024-R0488', 'CAO-PB-2024-R0489', 'CAO-PB-2024-R0490',
      'CAO-PB-2024-R0491', 'CAO-PB-2024-R0492', 'CAO-PB-2024-R0493',
      'CAO-PB-2024-R0494', 'CAO-PB-2024-R0495', 'CAO-PB-2024-R0496',
      'CAO-PB-2024-R0497', 'CAO-PB-2024-R0498', 'CAO-PB-2024-R0499',
      'CAO-PB-2024-R0500', 'CAO-PB-2024-R0501', 'CAO-PB-2024-R0502',
      'CAO-PB-2024-R0503', 'CAO-PB-2024-R0504', 'CAO-PB-2024-R0505',
      'CAO-PB-2024-R0506', 'CAO-PB-2024-R0507', 'CAO-PB-2024-R0508',
      'CAO-PB-2024-R0509', 'CAO-PB-2024-R0510', 'CAO-PB-2024-R0511',
      'CAO-PB-2024-R0512', 'CAO-PB-2024-R0513', 'CAO-PB-2024-R0514',
      'CAO-PB-2024-R0515', 'CAO-PB-2024-R0516', 'CAO-PB-2024-R0517',
      'CAO-PB-2024-R0518', 'CAO-PB-2024-R0519', 'CAO-PB-2024-R0520',
      'CAO-PB-2024-R0521', 'CAO-PB-2024-R0522', 'CAO-PB-2024-R0523',
      'CAO-PB-2024-R0524', 'CAO-PB-2024-R0525', 'CAO-PB-2024-R0526',
      'CAO-PB-2024-R0527', 'CAO-PB-2024-R0528', 'CAO-PB-2024-R0529',
      'CAO-PB-2024-R0530', 'CAO-PB-2024-R0531', 'CAO-PB-2024-R0532',
      'CAO-PB-2024-R0533', 'CAO-PB-2024-R0534', 'CAO-PB-2024-R0535',
      'CAO-PB-2024-R0536', 'CAO-PB-2024-R0537', 'CAO-PB-2024-R0538',
      'CAO-PB-2024-R0539', 'CAO-PB-2024-R0540', 'CAO-PB-2024-R0541',
      'CAO-PB-2024-R0542', 'CAO-PB-2024-R0543', 'CAO-PB-2024-R0544',
      'CAO-PB-2024-R0545'
    ]
  },
  'validateCaoScheduleRules.roster_period_constraints': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts', 'calculateRoutePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0547', 'CAO-PB-2024-R0548', 'CAO-PB-2024-R0549',
      'CAO-PB-2024-R0560', 'CAO-PB-2024-R0561',
      'CAO-PB-2024-R0562', 'CAO-PB-2024-R0563', 'CAO-PB-2024-R0564',
      'CAO-PB-2024-R0565', 'CAO-PB-2024-R0566', 'CAO-PB-2024-R0567',
      'CAO-PB-2024-R0568', 'CAO-PB-2024-R0569', 'CAO-PB-2024-R0570',
      'CAO-PB-2024-R0571', 'CAO-PB-2024-R0572', 'CAO-PB-2024-R0573',
      'CAO-PB-2024-R0574', 'CAO-PB-2024-R0575', 'CAO-PB-2024-R0576',
      'CAO-PB-2024-R0577', 'CAO-PB-2024-R0578', 'CAO-PB-2024-R0579',
      'CAO-PB-2024-R0580', 'CAO-PB-2024-R0581', 'CAO-PB-2024-R0582',
      'CAO-PB-2024-R0583', 'CAO-PB-2024-R0584', 'CAO-PB-2024-R0585',
      'CAO-PB-2024-R0586', 'CAO-PB-2024-R0587', 'CAO-PB-2024-R0588',
      'CAO-PB-2024-R0589', 'CAO-PB-2024-R0590', 'CAO-PB-2024-R0591',
      'CAO-PB-2024-R0592', 'CAO-PB-2024-R0593', 'CAO-PB-2024-R0594',
      'CAO-PB-2024-R0595', 'CAO-PB-2024-R0596', 'CAO-PB-2024-R0597',
      'CAO-PB-2024-R0598', 'CAO-PB-2024-R0599', 'CAO-PB-2024-R0600',
      'CAO-PB-2024-R0601', 'CAO-PB-2024-R0602', 'CAO-PB-2024-R0603',
      'CAO-PB-2024-R0604', 'CAO-PB-2024-R0605', 'CAO-PB-2024-R0606',
      'CAO-PB-2024-R0607', 'CAO-PB-2024-R0608', 'CAO-PB-2024-R0609',
      'CAO-PB-2024-R0610', 'CAO-PB-2024-R0611', 'CAO-PB-2024-R0612',
      'CAO-PB-2024-R0613', 'CAO-PB-2024-R0614', 'CAO-PB-2024-R0615',
      'CAO-PB-2024-R0616', 'CAO-PB-2024-R0617', 'CAO-PB-2024-R0618',
      'CAO-PB-2024-R0619', 'CAO-PB-2024-R0620', 'CAO-PB-2024-R0621',
      'CAO-PB-2024-R0622', 'CAO-PB-2024-R0623', 'CAO-PB-2024-R0624',
      'CAO-PB-2024-R0625', 'CAO-PB-2024-R0626', 'CAO-PB-2024-R0627',
      'CAO-PB-2024-R0628', 'CAO-PB-2024-R0629', 'CAO-PB-2024-R0630',
      'CAO-PB-2024-R0631', 'CAO-PB-2024-R0632', 'CAO-PB-2024-R0633',
      'CAO-PB-2024-R0634', 'CAO-PB-2024-R0635', 'CAO-PB-2024-R0636',
      'CAO-PB-2024-R0637', 'CAO-PB-2024-R0638', 'CAO-PB-2024-R0639',
      'CAO-PB-2024-R0640', 'CAO-PB-2024-R0641', 'CAO-PB-2024-R0642',
      'CAO-PB-2024-R0643', 'CAO-PB-2024-R0644', 'CAO-PB-2024-R0645',
      'CAO-PB-2024-R0646', 'CAO-PB-2024-R0647', 'CAO-PB-2024-R0648',
      'CAO-PB-2024-R0649', 'CAO-PB-2024-R0650', 'CAO-PB-2024-R0651',
      'CAO-PB-2024-R0652', 'CAO-PB-2024-R0653', 'CAO-PB-2024-R0654',
      'CAO-PB-2024-R0655', 'CAO-PB-2024-R0656', 'CAO-PB-2024-R0657',
      'CAO-PB-2024-R0658', 'CAO-PB-2024-R0659', 'CAO-PB-2024-R0660',
      'CAO-PB-2024-R0661', 'CAO-PB-2024-R0662', 'CAO-PB-2024-R0663',
      'CAO-PB-2024-R0664', 'CAO-PB-2024-R0665', 'CAO-PB-2024-R0666',
      'CAO-PB-2024-R0667', 'CAO-PB-2024-R0668', 'CAO-PB-2024-R0669',
      'CAO-PB-2024-R0670', 'CAO-PB-2024-R0671', 'CAO-PB-2024-R0672',
      'CAO-PB-2024-R0673', 'CAO-PB-2024-R0674', 'CAO-PB-2024-R0675',
      'CAO-PB-2024-R0676', 'CAO-PB-2024-R0677', 'CAO-PB-2024-R0678',
      'CAO-PB-2024-R0679', 'CAO-PB-2024-R0680', 'CAO-PB-2024-R0681',
      'CAO-PB-2024-R0682', 'CAO-PB-2024-R0683', 'CAO-PB-2024-R0684',
      'CAO-PB-2024-R0685', 'CAO-PB-2024-R0686', 'CAO-PB-2024-R0687',
      'CAO-PB-2024-R0688', 'CAO-PB-2024-R0689', 'CAO-PB-2024-R0690',
      'CAO-PB-2024-R0691', 'CAO-PB-2024-R0692', 'CAO-PB-2024-R0693',
      'CAO-PB-2024-R0694', 'CAO-PB-2024-R0695', 'CAO-PB-2024-R0696',
      'CAO-PB-2024-R0697', 'CAO-PB-2024-R0698', 'CAO-PB-2024-R0699',
      'CAO-PB-2024-R0700', 'CAO-PB-2024-R0701', 'CAO-PB-2024-R0702',
      'CAO-PB-2024-R0703', 'CAO-PB-2024-R0704', 'CAO-PB-2024-R0705',
      'CAO-PB-2024-R0706', 'CAO-PB-2024-R0707', 'CAO-PB-2024-R0708',
      'CAO-PB-2024-R0709', 'CAO-PB-2024-R0710', 'CAO-PB-2024-R0711',
      'CAO-PB-2024-R0712', 'CAO-PB-2024-R0713'
    ]
  },
  'resolveCaoFunctionClassification.appendix_2_wage_scales': {
    functions: ['resolveCaoApplicability', 'resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0714', 'CAO-PB-2024-R0715', 'CAO-PB-2024-R0716',
      'CAO-PB-2024-R0728', 'CAO-PB-2024-R0729', 'CAO-PB-2024-R0731',
      'CAO-PB-2024-R0733', 'CAO-PB-2024-R0734', 'CAO-PB-2024-R0738',
      'CAO-PB-2024-R0739', 'CAO-PB-2024-R0740', 'CAO-PB-2024-R0741',
      'CAO-PB-2024-R0742', 'CAO-PB-2024-R0743', 'CAO-PB-2024-R0744',
      'CAO-PB-2024-R0745', 'CAO-PB-2024-R0746', 'CAO-PB-2024-R0747',
      'CAO-PB-2024-R1751', 'CAO-PB-2024-R1813'
    ]
  },
  'calculatePersonnelCosts.article_39_acting_function_allowance': {
    functions: ['resolveCaoFunctionClassification', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0775', 'CAO-PB-2024-R0776', 'CAO-PB-2024-R0777',
      'CAO-PB-2024-R0778', 'CAO-PB-2024-R0779', 'CAO-PB-2024-R0780',
      'CAO-PB-2024-R0781', 'CAO-PB-2024-R0782', 'CAO-PB-2024-R0783'
    ]
  },
  'calculateCaoYearEndBonus.article_38_year_end_bonus': {
    functions: ['calculatePersonnelCosts', 'calculateCaoYearEndBonus', 'queueCaoPayrollCorrections'],
    rule_ids: [
      'CAO-PB-2024-R0770', 'CAO-PB-2024-R0771',
      'CAO-PB-2024-R0772', 'CAO-PB-2024-R0773'
    ]
  },
  'calculatePersonnelCosts.article_25_general_reserve_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ['CAO-PB-2024-R0605', 'CAO-PB-2024-R0606']
  },
  'calculatePersonnelCosts.article_42_overtime_payroll': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: ['CAO-PB-2024-R0797']
  },
  'calculatePersonnelCosts.article_43_44_shift_change_allowance': {
    functions: ['validateCaoScheduleRules', 'calculatePersonnelCosts'],
    rule_ids: [
      'CAO-PB-2024-R0576', 'CAO-PB-2024-R0580', 'CAO-PB-2024-R0585',
      'CAO-PB-2024-R0586', 'CAO-PB-2024-R0606',
      'CAO-PB-2024-R0799', 'CAO-PB-2024-R0800', 'CAO-PB-2024-R0801',
      'CAO-PB-2024-R0802', 'CAO-PB-2024-R0803', 'CAO-PB-2024-R0804',
      'CAO-PB-2024-R0805', 'CAO-PB-2024-R0806', 'CAO-PB-2024-R0807'
    ]
  },
  'calculatePersonnelCosts.article_45_minimum_service_compensation': {
    functions: ['calculatePersonnelCosts', 'validateCaoScheduleRules', 'calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R0810', 'CAO-PB-2024-R0811', 'CAO-PB-2024-R0812',
      'CAO-PB-2024-R0813', 'CAO-PB-2024-R0814', 'CAO-PB-2024-R0815',
      'CAO-PB-2024-R0816', 'CAO-PB-2024-R0817', 'CAO-PB-2024-R0818'
    ]
  },
  'calculateCaoReimbursements.article_47_48_49_50': {
    functions: ['calculateCaoReimbursements'],
    rule_ids: [
      'CAO-PB-2024-R0855', 'CAO-PB-2024-R0878', 'CAO-PB-2024-R0880',
      'CAO-PB-2024-R0885', 'CAO-PB-2024-R0890', 'CAO-PB-2024-R0895',
      'CAO-PB-2024-R0900', 'CAO-PB-2024-R0905', 'CAO-PB-2024-R1609'
    ]
  },
  'calculateCaoLeaveAndSickness.leave_and_sickness_basic': {
    functions: ['calculateCaoLeaveAndSickness'],
    rule_ids: [
      'CAO-PB-2024-R0999', 'CAO-PB-2024-R1149',
      'CAO-PB-2024-R1159', 'CAO-PB-2024-R1160'
    ]
  }
};

const LOCAL_RUNTIME_RULE_ID_INDEX = Object.entries(LOCAL_RUNTIME_RULE_BINDINGS)
  .reduce((acc, [key, binding]) => {
    for (const ruleId of binding.rule_ids) acc[ruleId] = { key, ...binding };
    return acc;
  }, {});

function hasAnyNeedle(value, needles) {
  const text = String(value || '').toLowerCase();
  return needles.some(needle => text.includes(needle));
}

function getLocalRuntimeBinding(rule) {
  return LOCAL_RUNTIME_RULE_ID_INDEX[rule?.rule_id] || null;
}

function withLocalRuntimeBindingMetadata(rule) {
  const binding = getLocalRuntimeBinding(rule);
  const critical = isPayrollCriticalRule(rule);
  return {
    ...rule,
    runtime_binding_status: binding ? 'verified_local_runtime' : critical ? 'missing_local_runtime' : 'not_required',
    runtime_binding_key: binding?.key || null,
    runtime_binding_functions: binding?.functions || [],
    local_runtime_verified_at: binding ? new Date().toISOString() : null
  };
}

async function findExistingCaoRule(base44, { ruleId, caoKey, configId }) {
  if (configId) {
    const scoped = await base44.asServiceRole.entities.CAORule.filter({
      rule_id: ruleId,
      cao_configuration_id: configId
    });
    if (scoped.length > 0) return scoped[0];
  }

  if (!configId) {
    const candidates = await base44.asServiceRole.entities.CAORule.filter({
      rule_id: ruleId,
      cao_key: caoKey
    });
    return candidates.find(rule => !rule.cao_configuration_id) || null;
  }

  return null;
}

function hasWageScales(candidateCfg) {
  return Object.keys(candidateCfg?.wage_scales || {}).length > 0 ||
    Object.keys(candidateCfg?.wage_scales_detailed || {}).length > 0;
}

function hasPayPeriods(candidateCfg) {
  const payPeriods = candidateCfg?.pay_periods;
  if (!payPeriods) return false;
  if (Array.isArray(payPeriods)) return payPeriods.length > 0;
  if (typeof payPeriods === 'object') return Object.keys(payPeriods).length > 0;
  return false;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDeclaredCoverageSummary(candidateCfg) {
  return candidateCfg?.coverage_summary ||
    candidateCfg?.rule_engine_metadata?.coverage_summary ||
    candidateCfg?.source_coverage_summary ||
    {};
}

function getSourceCoverageMinimums(candidateCfg) {
  const summary = getDeclaredCoverageSummary(candidateCfg);
  const minimums = { ...CAO_PB_2024_2026_SOURCE_COVERAGE_MINIMUMS };
  const declaredTotal = numberOrNull(
    summary.expected_total_rules ??
    summary.total_atomic_rules ??
    summary.total_source_rules ??
    summary.total
  );
  if (declaredTotal && declaredTotal > minimums.total) minimums.total = declaredTotal;

  const byLevel = summary.expected_automation_level_counts ||
    summary.by_automation_level ||
    summary.automation_level_counts ||
    {};
  for (const key of ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation']) {
    const declared = numberOrNull(byLevel[key]);
    if (declared && declared > minimums[key]) minimums[key] = declared;
  }
  return minimums;
}

function countByAutomationLevel(rules) {
  return rules.reduce((acc, rule) => {
    const key = rule.automation_level || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function evaluateSourceCoverageCompleteness(candidateCfg, rules) {
  const minimums = getSourceCoverageMinimums(candidateCfg);
  const uniqueRuleIds = new Set(rules.map(rule => rule.rule_id).filter(Boolean));
  const byAutomationLevel = countByAutomationLevel(rules);
  const blockingFindings = [];

  if (uniqueRuleIds.size < minimums.total) {
    blockingFindings.push({
      code: 'incomplete_source_rule_coverage',
      severity: 'critical',
      message: `CAO-broncoverage is incompleet: ${uniqueRuleIds.size} unieke regels aanwezig, minimaal ${minimums.total} verwacht voor CAO PB 2024-2026.`
    });
  }

  for (const key of ['automatic_or_calculation', 'validation_or_policy', 'workflow_or_documentation']) {
    const actual = byAutomationLevel[key] || 0;
    const expected = minimums[key] || 0;
    if (actual < expected) {
      blockingFindings.push({
        code: `incomplete_${key}_coverage`,
        severity: 'critical',
        message: `CAO-broncoverage voor ${key} is incompleet: ${actual} regels aanwezig, minimaal ${expected} verwacht.`
      });
    }
  }

  return {
    passed: blockingFindings.length === 0,
    unique_rule_ids: uniqueRuleIds.size,
    by_automation_level: byAutomationLevel,
    minimums,
    blocking_findings: blockingFindings
  };
}

function isPayrollCriticalRule(rule) {
  const automationLevel = String(rule.automation_level || '').toLowerCase();
  const calculationPolicy = String(rule.calculation_policy || '').toLowerCase();
  const implementationStatus = String(rule.implementation_status || '').toUpperCase();

  if (calculationPolicy === 'not_payroll') return false;
  if (['reference', 'reference_or_policy'].includes(automationLevel) && implementationStatus === 'REFERENCE') return false;

  return calculationPolicy === 'automatic' ||
    automationLevel === 'automatic_or_calculation' ||
    automationLevel === 'validation_or_policy' ||
    hasAnyNeedle(rule.domain, PAYROLL_CRITICAL_DOMAINS) ||
    hasAnyNeedle(rule.impact, ['payroll', 'calculation', 'planning', 'validation']) ||
    hasAnyNeedle(rule.rule_id, ['R031', 'R032', 'R037', 'R038', 'R039', 'R040', 'R041', 'R042', 'R043', 'R047', 'R048', 'R056', 'R057', 'R058', 'R059', 'R064', 'R065', 'R066', 'R067', 'R072', 'R073', 'R085', 'R087', 'R088', 'R089', 'R090', 'R099', 'R114', 'R115', 'R116', 'R160', 'R175', 'R181']);
}

function evaluateCaoCoverageGate(candidateCfg, candidateRules) {
  const rules = Array.isArray(candidateRules) ? candidateRules : [];
  const sourceCoverage = evaluateSourceCoverageCompleteness(candidateCfg, rules);
  const counts = {
    total: rules.length,
    unique_rule_ids: sourceCoverage.unique_rule_ids,
    by_automation_level: sourceCoverage.by_automation_level,
    source_coverage_minimums: sourceCoverage.minimums,
    source_coverage_passed: sourceCoverage.passed,
    implemented: 0,
    partial: 0,
    missing: 0,
    reference: 0,
    unknown: 0,
    manual_review_required: 0,
    payroll_critical: 0,
    payroll_critical_open: 0,
    runtime_bound: 0,
    runtime_missing: 0,
    implemented_without_runtime_binding: 0,
    implemented_without_test_evidence: 0,
    partial_without_manual_review: 0
  };
  const openCriticalRules = [];
  const implementedWithoutRuntimeBinding = [];
  const implementedWithoutTestEvidence = [];
  const partialWithoutManualReview = [];
  const missingTextRules = [];

  for (const rule of rules) {
    const status = String(rule.implementation_status || 'MISSING').toUpperCase();
    const runtimeBinding = getLocalRuntimeBinding(rule);
    if (status === 'IMPLEMENTED') counts.implemented++;
    else if (status === 'PARTIAL') counts.partial++;
    else if (status === 'MISSING') counts.missing++;
    else if (status === 'REFERENCE') counts.reference++;
    else counts.unknown++;

    if (rule.manual_review_required === true) counts.manual_review_required++;
    if (!rule.rule_text && !rule.rule_text_summary) missingTextRules.push(rule.rule_id || 'unknown');

    if (isPayrollCriticalRule(rule)) {
      counts.payroll_critical++;
      if (runtimeBinding) counts.runtime_bound++;
      else counts.runtime_missing++;

      const lacksRuntimeBinding = status === 'IMPLEMENTED' && !runtimeBinding;
      const lacksTestEvidence = status === 'IMPLEMENTED' &&
        (!rule.tests || (Array.isArray(rule.tests) && rule.tests.length === 0) ||
          (typeof rule.tests === 'object' && !Array.isArray(rule.tests) && Object.keys(rule.tests).length === 0));
      const partialWithoutReview = status === 'PARTIAL' && rule.manual_review_required !== true;
      if (lacksRuntimeBinding) {
        counts.implemented_without_runtime_binding++;
        implementedWithoutRuntimeBinding.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'IMPLEMENTED',
          implemented_in: rule.implemented_in || [],
          message: 'Regel claimt IMPLEMENTED, maar heeft geen lokale runtime-binding in Base44.'
        });
      }
      if (lacksTestEvidence) {
        counts.implemented_without_test_evidence++;
        implementedWithoutTestEvidence.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'IMPLEMENTED',
          implemented_in: rule.implemented_in || [],
          message: 'Regel claimt IMPLEMENTED, maar CAORule.tests bevat geen testbewijs.'
        });
      }
      if (partialWithoutReview) {
        counts.partial_without_manual_review++;
        partialWithoutManualReview.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'PARTIAL',
          message: 'Regel is PARTIAL, maar manual_review_required is niet true.'
        });
      }

      if (status !== 'IMPLEMENTED' || rule.manual_review_required === true || lacksRuntimeBinding || lacksTestEvidence || partialWithoutReview) {
        counts.payroll_critical_open++;
        openCriticalRules.push({
          rule_id: rule.rule_id || 'unknown',
          domain: rule.domain || null,
          implementation_status: rule.implementation_status || 'MISSING',
          manual_review_required: rule.manual_review_required === true,
          automation_level: rule.automation_level || null,
          calculation_policy: rule.calculation_policy || null,
          runtime_binding_status: runtimeBinding ? 'verified_local_runtime' : 'missing_local_runtime',
          runtime_binding_key: runtimeBinding?.key || null,
          runtime_binding_functions: runtimeBinding?.functions || []
        });
      }
    }
  }

  const blockingFindings = [];
  blockingFindings.push(...sourceCoverage.blocking_findings);
  if (!candidateCfg?.valid_from) {
    blockingFindings.push({
      code: 'missing_effective_date',
      severity: 'critical',
      message: 'candidate_configuration.valid_from ontbreekt; payroll kan zonder ingangsdatum niet veilig historisch rekenen.'
    });
  }
  if (rules.length === 0) {
    blockingFindings.push({
      code: 'missing_rules',
      severity: 'critical',
      message: 'candidate_rules is leeg; CAO-regeldekking kan niet worden bewezen.'
    });
  }
  if (!hasWageScales(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_wage_scales',
      severity: 'critical',
      message: 'Loontabellen ontbreken; loonberekening mag niet payroll-ready zijn.'
    });
  }
  if (!hasPayPeriods(candidateCfg)) {
    blockingFindings.push({
      code: 'missing_pay_periods',
      severity: 'high',
      message: 'Loonperiodetabel ontbreekt; payrollcorrecties en historische runs kunnen niet betrouwbaar worden afgebakend.'
    });
  }
  if (openCriticalRules.length > 0) {
    blockingFindings.push({
      code: 'open_payroll_critical_rules',
      severity: 'critical',
      message: `${openCriticalRules.length} payrollkritische CAO-regels zijn niet volledig geïmplementeerd of vereisen handmatige review.`
    });
  }
  if (implementedWithoutRuntimeBinding.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_runtime_binding',
      severity: 'critical',
      message: `${implementedWithoutRuntimeBinding.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen een lokale runtime-binding.`
    });
  }
  if (implementedWithoutTestEvidence.length > 0) {
    blockingFindings.push({
      code: 'implemented_rules_without_test_evidence',
      severity: 'high',
      message: `${implementedWithoutTestEvidence.length} payrollkritische CAO-regels claimen IMPLEMENTED, maar missen testbewijs.`
    });
  }
  if (partialWithoutManualReview.length > 0) {
    blockingFindings.push({
      code: 'partial_rules_without_manual_review',
      severity: 'high',
      message: `${partialWithoutManualReview.length} payrollkritische PARTIAL-regels missen manual_review_required=true.`
    });
  }

  let status = 'ready';
  if (blockingFindings.some(f => f.code === 'missing_effective_date')) status = 'blocked_missing_effective_date';
  else if (blockingFindings.some(f => f.code === 'missing_rules')) status = 'blocked_missing_rules';
  else if (blockingFindings.some(f => String(f.code || '').startsWith('incomplete_'))) status = 'blocked_incomplete_source_coverage';
  else if (blockingFindings.some(f => f.code === 'missing_wage_scales' || f.code === 'missing_pay_periods')) status = 'blocked_missing_payroll_parameters';
  else if (openCriticalRules.length > 0 || implementedWithoutRuntimeBinding.length > 0) status = 'blocked_incomplete_runtime_rules';
  else if (counts.manual_review_required > 0) status = 'manual_review_required';

  return {
    passed: blockingFindings.length === 0,
    status,
    checked_at: new Date().toISOString(),
    counts,
    source_coverage: sourceCoverage,
    blocking_findings: blockingFindings,
    open_payroll_critical_rules: openCriticalRules.slice(0, 100),
    open_payroll_critical_rules_truncated: openCriticalRules.length > 100,
    implemented_without_runtime_binding_rules: implementedWithoutRuntimeBinding.slice(0, 100),
    implemented_without_runtime_binding_truncated: implementedWithoutRuntimeBinding.length > 100,
    implemented_without_test_evidence_rules: implementedWithoutTestEvidence.slice(0, 100),
    implemented_without_test_evidence_truncated: implementedWithoutTestEvidence.length > 100,
    partial_without_manual_review_rules: partialWithoutManualReview.slice(0, 100),
    partial_without_manual_review_truncated: partialWithoutManualReview.length > 100,
    local_runtime_binding_keys: Object.keys(LOCAL_RUNTIME_RULE_BINDINGS),
    missing_rule_text_rule_ids: missingTextRules.slice(0, 100),
    missing_rule_text_truncated: missingTextRules.length > 100
  };
}

function resolvePayrollReadiness(candidateCfg, candidateRules, isOwnerApproved) {
  const gate = evaluateCaoCoverageGate(candidateCfg, candidateRules);
  const requestedPayrollReady = candidateCfg?.is_payroll_ready === true;
  const isPayrollReady = isOwnerApproved && requestedPayrollReady && gate.passed;
  return {
    gate,
    requested_payroll_ready: requestedPayrollReady,
    is_payroll_ready: isPayrollReady,
    status: isPayrollReady ? 'ready' : (requestedPayrollReady ? gate.status : (gate.passed ? 'owner_not_marked_ready' : gate.status))
  };
}

function isPayrollImpactChange(change) {
  if (change.payroll_impact === true) return true;
  return hasAnyNeedle(
    `${change.rule_key || ''} ${change.field_path || ''} ${change.domain || ''} ${change.change_type || ''}`,
    PAYROLL_CRITICAL_DOMAINS
  );
}

function buildChangeEffectiveMetadata(change, fallbackValidFrom, approvedAt) {
  const effectiveFrom = change.effective_from || change.valid_from || change.applies_from || fallbackValidFrom || null;
  const effectiveUntil = change.effective_until || change.valid_until || null;
  const payrollImpact = isPayrollImpactChange(change);
  const approvedDate = approvedAt ? new Date(approvedAt) : new Date();
  const approvedDay = approvedDate.toISOString().slice(0, 10);
  const retroactive = change.retroactive === true ||
    (!!effectiveFrom && effectiveFrom < approvedDay);
  const correctionRequired = payrollImpact && retroactive;

  return {
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    payroll_impact: payrollImpact,
    retroactive,
    correction_required: correctionRequired,
    correction_status: correctionRequired ? 'candidate' : 'not_required'
  };
}

Deno.serve(async (req) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Validate shared secret — must match CAO_AUTOMATION_SHARED_SECRET env var
    const authHeader = req.headers.get('Authorization') || '';
    const secret = Deno.env.get('CAO_AUTOMATION_SHARED_SECRET');
    if (!secret) {
      return Response.json({ error: 'CAO_AUTOMATION_SHARED_SECRET not configured on server.' }, { status: 500 });
    }
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearerToken || bearerToken !== secret) {
      return Response.json({ error: 'Unauthorized — invalid or missing CAO automation secret.' }, { status: 401 });
    }

    const cloudflareRequestId = req.headers.get('cf-ray') || req.headers.get('x-request-id') || null;

    const body = await req.json();
    const {
      idempotency_key,
      revision,
      cao_key,
      automation_version,
      approval,
      source_documents = [],
      candidate_configuration = {},
      candidate_rules = [],
      detected_changes = []
    } = body;

    if (!idempotency_key) {
      return Response.json({ error: 'idempotency_key is verplicht.' }, { status: 400 });
    }
    if (!cao_key) {
      return Response.json({ error: 'cao_key is verplicht.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    // Idempotency check — reject duplicate ingest runs
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key
    });
    if (existingRuns.length > 0) {
      const prev = existingRuns[0];
      return Response.json({
        success: true,
        idempotency_key,
        message: 'Payload al eerder verwerkt (idempotent).',
        import_run_id: prev.id,
        cao_configuration_id: prev.created_configuration_id || null,
        applied: prev.status === 'completed',
        duplicate: true
      });
    }

    const isOwnerApproved = approval?.status === 'approved_by_owner';
    const trigger_type = 'cloudflare_relay';
    const approval_status = isOwnerApproved ? 'owner_approved' : 'proposed';
    const payrollReadiness = resolvePayrollReadiness(candidate_configuration, candidate_rules, isOwnerApproved);

    // Maak ImportRun aan
    const importRun = await base44.asServiceRole.entities.CAOImportRun.create({
      started_at: now,
      finished_at: null,
      trigger_type,
      status: 'running',
      idempotency_key,
      approval_status,
      codex_thread_id: approval?.codex_thread_id || null,
      cloudflare_request_id: cloudflareRequestId,
      source_document_ids: [],
      detected_changes: [],
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary: null,
      error_message: null
    });

    // Upsert source documents
    const sourceDocIds = [];
    for (const doc of source_documents) {
      if (!doc.url) continue;
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      const docData = {
        title: doc.title || doc.url,
        url: doc.url,
        source_type: doc.source_type || 'other',
        status: 'active',
        content_hash: doc.content_hash || null,
        etag: doc.etag || null,
        last_modified: doc.last_modified || null,
        first_seen_at: existing[0]?.first_seen_at || now,
        last_checked_at: now,
        last_changed_at: doc.changed ? now : (existing[0]?.last_changed_at || null),
        extraction_status: 'ok'
      };
      let savedDoc;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, docData);
        savedDoc = { id: existing[0].id };
      } else {
        savedDoc = await base44.asServiceRole.entities.CAOSourceDocument.create(docData);
      }
      sourceDocIds.push(savedDoc.id);
    }

    // Upsert / create CAOConfiguration
    let configId = null;
    if (Object.keys(candidate_configuration).length > 0 || isOwnerApproved) {
      const existingConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({ cao_key });

      const configData = {
        ...candidate_configuration,
        cao_key,
        status: isOwnerApproved ? 'active' : 'draft',
        is_active: isOwnerApproved,
        is_payroll_ready: payrollReadiness.is_payroll_ready,
        payroll_readiness_status: payrollReadiness.status,
        payroll_readiness_checked_at: payrollReadiness.gate.checked_at,
        payroll_readiness_gate: payrollReadiness.gate,
        coverage_summary: {
          ...(candidate_configuration.coverage_summary || {}),
          payroll_readiness: {
            status: payrollReadiness.status,
            requested_payroll_ready: payrollReadiness.requested_payroll_ready,
            passed: payrollReadiness.gate.passed,
            counts: payrollReadiness.gate.counts,
            blocking_findings: payrollReadiness.gate.blocking_findings
          }
        },
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: approval?.approved_by_owner_name || null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        codex_approval_message: approval?.approval_message || null,
        cloudflare_request_id: cloudflareRequestId,
        cloudflare_revision: revision || candidate_configuration.cloudflare_revision || null,
        idempotency_key,
        automation_version: automation_version || null
      };

      if (isOwnerApproved) {
        // Archiveer alleen exacte duplicaten. Andere actieve configs met andere
        // valid_from/valid_until blijven bestaan voor historische berekeningen.
        const duplicateConfigs = existingConfigs.filter(existing =>
          (revision && existing.cloudflare_revision === revision) ||
          existing.idempotency_key === idempotency_key
        );
        for (const existing of duplicateConfigs) {
          await base44.asServiceRole.entities.CAOConfiguration.update(existing.id, {
            status: 'archived',
            is_active: false
          });
        }
      }

      // Check for existing pending config with same idempotency_key
      const existingPending = existingConfigs.find(c => c.idempotency_key === idempotency_key);
      if (existingPending) {
        await base44.asServiceRole.entities.CAOConfiguration.update(existingPending.id, configData);
        configId = existingPending.id;
      } else {
        const newConfig = await base44.asServiceRole.entities.CAOConfiguration.create(configData);
        configId = newConfig.id;
      }
    }

    // Upsert CAO rules
    let rulesUpserted = 0;
    for (const rule of candidate_rules) {
      if (!rule.rule_id) continue;
      const targetCaoKey = rule.cao_key || cao_key;
      const targetConfigId = configId || rule.cao_configuration_id || null;
      const existing = await findExistingCaoRule(base44, {
        ruleId: rule.rule_id,
        caoKey: targetCaoKey,
        configId: targetConfigId
      });
      const ruleData = {
        ...withLocalRuntimeBindingMetadata(rule),
        cao_key: targetCaoKey,
        cao_configuration_id: targetConfigId,
        status: isOwnerApproved ? 'active' : 'draft',
        last_verified_at: isOwnerApproved ? now : (rule.last_verified_at || null)
      };
      if (existing) {
        await base44.asServiceRole.entities.CAORule.update(existing.id, ruleData);
      } else {
        await base44.asServiceRole.entities.CAORule.create(ruleData);
      }
      rulesUpserted++;
    }

    // Create CAOChangeReview records
    const reviewIds = [];
    const reviewStatus = isOwnerApproved ? 'applied' : 'proposed';
    for (const change of detected_changes) {
      const effectiveMeta = buildChangeEffectiveMetadata(
        change,
        candidate_configuration.valid_from || null,
        approval?.approved_at || null
      );
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: configId,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        source_document_id: change.source_document_id || null,
        source_reference: change.source_reference || null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'low',
        ...effectiveMeta,
        status: reviewStatus,
        approval_source: approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: isOwnerApproved ? (approval?.approved_by_owner_name || null) : null,
        approved_at: isOwnerApproved ? (approval?.approved_at || now) : null,
        codex_thread_id: approval?.codex_thread_id || null,
        cloudflare_request_id: cloudflareRequestId,
        idempotency_key,
        review_notes: isOwnerApproved
          ? `Owner-approved via Codex (${approval?.approved_by_owner_name || 'owner'}) on ${approval?.approved_at || now}`
          : 'Proposed — awaiting owner approval'
      });
      reviewIds.push(review.id);
    }

    let correctionQueueSummary = null;
    if (reviewIds.length > 0 && isOwnerApproved) {
      try {
        const queueRes = await base44.asServiceRole.functions.invoke('queueCaoPayrollCorrections', {
          review_ids: reviewIds,
          import_run_id: importRun.id,
          idempotency_key,
          sync_trigger_secret: Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET')
        });
        correctionQueueSummary = queueRes?.data || null;
      } catch (error) {
        correctionQueueSummary = {
          success: false,
          error: error.message,
          note: 'Owner-approved ingest voltooid, maar queueCaoPayrollCorrections faalde. Handmatige queue-run vereist.'
        };
      }
    }

    const summary = isOwnerApproved
      ? `Owner-approved CAO payload toegepast. Config: ${configId}. Regels: ${rulesUpserted}. Wijzigingen: ${reviewIds.length}. Payrollcorrecties nieuw: ${correctionQueueSummary?.corrections_created || 0}, bijgewerkt: ${correctionQueueSummary?.corrections_updated || 0}.`
      : `Proposed CAO payload ontvangen (niet geactiveerd — geen owner approval). Regels: ${rulesUpserted}.`;

    // Finalize import run
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      source_document_ids: sourceDocIds,
      created_configuration_id: configId,
      created_review_ids: reviewIds,
      created_correction_ids: [
        ...(correctionQueueSummary?.created_correction_ids || []),
        ...(correctionQueueSummary?.updated_correction_ids || [])
      ],
      correction_queue_summary: correctionQueueSummary,
      detected_changes,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

    return Response.json({
      success: true,
      idempotency_key,
      import_run_id: importRun.id,
      cao_configuration_id: configId,
      applied: isOwnerApproved,
      changes_count: reviewIds.length,
      rules_upserted: rulesUpserted,
      source_docs_upserted: sourceDocIds.length,
      correction_queue_summary: correctionQueueSummary,
      is_payroll_ready: payrollReadiness.is_payroll_ready,
      payroll_readiness_status: payrollReadiness.status,
      coverage_gate: payrollReadiness.gate,
      summary
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
