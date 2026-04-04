import pino from 'pino';
import { config } from '../types/config';

const logger = pino({ level: config.logLevel });

// ===== \u5929\u5E72\u5730\u652F\u7CFB\u7EDF =====

const TIANGAN: string[] = [
  '\u7532', '\u4E59', '\u4E19', '\u4E01', '\u620A',
  '\u5DF1', '\u5E9A', '\u8F9B', "\u58EC", '\u7678',
];

const DIZHI: string[] = [
  '\u5B50', '\u4E11', '\u5BC5', '\u536F', '\u8FB0', '\u5DF3',
  '\u5348', '\u672A', '\u4E30', '\u914C', '\u620C', '\u4EA5',
];

/** \u751F\u8096\u52A8\u7269 */
const SHENGXIAO: string[] = [
  '\u9F20', '\u725B', '\u864E', '\u5154', '\u9F99', '\u86C7',
  '\u9A6C', '\u7F8A', '\u7334', '\u9E21', '\u72D7', '\u732A',
];

// ===== \u4E94\u884C =====

const WUXING_ELEMENTS: string[] = ['\u6728', '\u706B', '\u571F', '\u91D1', '\u6C34'];

/** \u5929\u5E72->\u4E94\u884C */
const TIANGAN_WUXING: number[] = [4, 4, 0, 0, 3, 3, 0, 1, 1, 2];
/** \u5730\u652F->\u4E94\u884C */
const DIZHI_WUXING: number[] = [2, 3, 0, 0, 0, 3, 1, 1, 1, 2, 2, 2];

// ===== \u8282\u6C14 =====

interface SolarTerm {
  name: string;
  /** \u516c\u5386\u6708.\u65E5 \uFF08\u7EA6\u503C\uFF09 */
  approxMonthDay: [number, number];
  desc: string;
}

const SOLAR_TERMS: SolarTerm[] = [
  { name: '\u5C0F\u5BD2', approxMonthDay: [1, 5],   desc: '\u5BD2\u51B7\u6F38\u8FD8\uFF0C\u9633\u6C14\u521A\u751F' },
  { name: '\u5927\u5BD2', approxMonthDay: [1, 20],  desc: '\u4E25\u5BD2\u81F3\u6781\uFF0C\u6697\u971C\u7EB3\u9526' },
  { name: '\u7ACB\u6625', approxMonthDay: [2, 3],   desc: '\u4E1C\u98CE\u89E3\u51BB\uFF0C\u87AB\u866B\u59CB\u632F' },
  { name: '\u96E8\u6C34', approxMonthDay: [2, 18],  desc: '\u4EF0\u89C2\u96E8\u6C34\uFF0C\u4E07\u7269\u517B\u6DAF' },
  { name: '\u60CA\u86B0', approxMonthDay: [3, 5],   desc: '\u6625\u96F7\u4F7C\u52A8\uFF0C\u866B\u86B0\u51FA\u5F85' },
  { name: '\u6625\u5206', approxMonthDay: [3, 20],  desc: '\u6635\u79CB\u5206\u591C\uFF0C\u9633\u6C14\u5347\u53D1' },
  { name: '\u6E05\u660E', approxMonthDay: [4, 4],   desc: '\u5929\u6E05\u5730\u660E\uFF0C\u4E07\u7269\u751F\u53D1' },
  { name: '\u8C37\u96E8', approxMonthDay: [4, 19],  desc: '\u96E8\u751F\u767E\u8C37\uFF0C\u6625\u79CD\u65F6\u8282' },
  { name: '\u7ACB\u590F', approxMonthDay: [5, 5],   desc: '\u69CC\u82B1\u5982\u706B\uFF0C\u590F\u65E5\u521D\u81F3' },
  { name: '\u5C0F\u6EE1', approxMonthDay: [5, 20],  desc: '\u9EA6\u79CB\u6210\u719F\uFF0C\u7269\u5230\u5C0F\u6EE1' },
  { name: '\u8292\u79CD', approxMonthDay: [6, 5],   desc: '\u878D\u68D2\u4EBA\u5FD9\uFF0C\u79CD\u4E0B\u5E0C\u671B' },
  { name: '\u590F\u81F3', approxMonthDay: [6, 21],  desc: '\u65E5\u5230\u5317\u56DE\uFF0C\u9633\u6C14\u6781\u76DB' },
  { name: '\u5C0F\u6691', approxMonthDay: [7, 6],   desc: '\u6E67\u71ED\u714E\u714E\uFF0C\u6691\u6C14\u6F13\u751F' },
  { name: '\u5927\u6691', approxMonthDay: [7, 22],  desc: '\u706B\u708E\u9AD8\u7109\uFF0C\u6D41\u91D1\u6DD1\u91D1' },
  { name: '\u7ACB\u79CB', approxMonthDay: [8, 7],   desc: '\u51C9\u98CE\u81F3\uFF0C\u79CB\u610F\u6F66\u6F66' },
  { name: '\u5904\u6691', approxMonthDay: [8, 22],  desc: '\u6691\u6C14\u6D88\u9000\uFF0C\u79CB\u98CE\u8D77' },
  { name: '\u767D\u9732', approxMonthDay: [9, 7],   desc: '\u9732\u51DD\u8001\u866B\uFF0C\u7A7A\u6C14\u6E05\u723D' },
  { name: '\u79CB\u5206', approxMonthDay: [9, 22],  desc: '\u9634\u9633\u534A\uFF0C\u5BD2\u6691\u5206' },
  { name: '\u5BD2\u9732', approxMonthDay: [10, 8],  desc: '\u9732\u51B7\u51DD\u7ED3\uFF0C\u79CB\u8272\u6DF1\u539A' },
  { name: '\u971C\u964D', approxMonthDay: [10, 23], desc: '\u8425\u8349\u679C\u51BB\uFF0C\u5BD2\u51B7\u521D\u81F3' },
  { name: '\u7ACB\u51AC', approxMonthDay: [11, 7],  desc: '\u51AC\u521D\u81F3\uFF0CE\u7269\u85CF\u4F11' },
  { name: '\u5C0F\u96EA', approxMonthDay: [11, 21], desc: '\u5929\u9634\u79EF\u973C\uFF0C\u5C0F\u96EA\u521D\u964D' },
  { name: '\u5927\u96EA', approxMonthDay: [12, 6],  desc: '\u745E\u96EA\u5146\u4E30\u5E74\uFF0C\u4E07\u7269\u85CF\u5BD2' },
  { name: '\u51AC\u81F3', approxMonthDay: [12, 21], desc: '\u9634\u6C14\u4E4B\u6781\uFF0C\u9633\u6C14\u59CB\u751F' },
];

// ===== \u65E5\u5E38\u5B9C\u5FCC\u6C60 =====

const YI_POOL: string[][] = [
  // 0=\u65E5\u6728 1=\u65E5\u706B 2=\u65E5\u571F 3=\u65E5\u91D1 4=\u65E5\u6C34
  [
    '\u796D\u79C0\u3001\u6C42\u5B50\u3001\u51FA\u884C\u3001\u6C42\u8D22\u3001\u7F6E\u4EA7',
    '\u5F00\u5E02\u3001\u7ED3\u5A5A\u3001\u7B7E\u7EA6',
    '\u5B89\u5E8A\u3001\u5F00\u5E02\u3001\u6C42\u822C',
    '\u5B89\u5E8A\u3001\u5F00\u5E02\u3001\u7ED3\u5A5A\u3001\u5B89\u95E8',
    '\u5F00\u5E02\u3001\u7ED3\u5A5A\u3001\u5B89\u95E8',
  ],
  [
    '\u6C42\u5B50\u3001\u5B89\u5E8A\u3001\u7ED3\u5A5A',
    '\u796D\u79C0\u3001\u51FA\u884C\u3001\u6C42\u8D22\u3001\u7F6E\u4EA7',
    '\u796D\u79C0\u3001\u6C42\u5B50\u3001\u5B89\u5E8A',
    '\u796D\u79C0\u3001\u6C42\u8D22\u3001\u7F6E\u4EA7',
    '\u7ED3\u5A5A\u3001\u5B89\u5E8A\u3001\u6C42\u8D22',
  ],
  [
    '\u7ED3\u5A5A\u3001\u5B89\u95E8',
    '\u7ED3\u5A5A\u3001\u5B89\u5E8A',
    '\u7ED3\u5A5A\u3001\u796D\u79C0',
    '\u7ED3\u5A5A\u3001\u5F00\u5E02\u3001\u6C42\u8D22',
    '\u796D\u79C0\u3001\u51FA\u884C',
  ],
  [
    '\u796D\u79C0\u3001\u6C42\u5B50\u3001\u5B89\u5E8A',
    '\u7ED3\u5A5A\u3001\u5B89\u5E8A',
    '\u7ED3\u5A5A\u3001\u796D\u79C0',
    '\u7ED3\u5A5A\u3001\u5F00\u5E02\u3001\u6C42\u8D22',
    '\u796D\u79C0\u3001\u51FA\u884C',
  ],
  [
    '\u7ED3\u5A5A\u3001\u796D\u79C0',
    '\u7ED3\u5A5A\u3001\u5B89\u5E8A',
    '\u7ED3\u5A5A\u3001\u5B89\u5E8A',
    '\u7ED3\u5A5A\u3001\u5F00\u5E02',
    '\u796D\u79C0',
  ],
];

const JI_POOL: string[][] = [
  [
    '\u5B89\u5E8A',
    '\u5B89\u95E8\u3001\u5B89\u5E8A',
    '\u51FA\u884C',
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
  ],
  [
    '\u5F00\u5E02',
    '\u51FA\u884C',
    '\u5F00\u5E02',
    '\u51FA\u884C',
    '\u51FA\u884C',
  ],
  [
    '\u5B89\u5E8A',
    '\u51FA\u884C',
    '\u51FA\u884C',
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
  ],
  [
    '\u5B89\u5E8A',
    '\u51FA\u884C',
    '\u51FA\u884C',
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
  ],
  [
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
    '\u5B89\u5E8A',
    '\u51FA\u884C',
  ],
];

// ===== \u65F6\u8FB0 =====

interface ShichenInfo {
  name: string;
  timeRange: string;
  wuxing: string;
  direction: string;
  yinYang: string;
}

const SHICHEN: ShichenInfo[] = [
  { name: '\u5B50\u65F6', timeRange: '23:00-01:00', wuxing: '\u6C34', direction: '\u5317', yinYang: '\u9633' },
  { name: '\u4E11\u65F6', timeRange: '01:00-03:00', wuxing: '\u571F', direction: '\u5317', yinYang: '\u9634' },
  { name: '\u5BC5\u65F6', timeRange: '03:00-05:00', wuxing: '\u6728', direction: '\u4E1C', yinYang: '\u9634' },
  { name: '\u536F\u65F6', timeRange: '05:00-07:00', wuxing: '\u6728', direction: '\u4E1C', yinYang: '\u9633' },
  { name: '\u8FB0\u65F6', timeRange: '07:00-09:00', wuxing: '\u571F', direction: '\u4E1C\u5357', yinYang: '\u9633' },
  { name: '\u5DF3\u65F6', timeRange: '09:00-11:00', wuxing: '\u706B', direction: '\u5357', yinYang: '\u9633' },
  { name: '\u5348\u65F6', timeRange: '11:00-13:00', wuxing: '\u706B', direction: '\u5357', yinYang: '\u9630' },
  { name: '\u672A\u65F6', timeRange: '13:00-15:00', wuxing: '\u571F', direction: '\u897F\u5357', yinYang: '\u9634' },
  { name: '\u4E30\u65F6', timeRange: '15:00-17:00', wuxing: '\u91D1', direction: '\u897F', yinYang: '\u9634' },
  { name: '\u914C\u65F6', timeRange: '17:00-19:00', wuxing: '\u91D1', direction: '\u897F', yinYang: '\u9634' },
  { name: '\u620C\u65F6', timeRange: '19:00-21:00', wuxing: '\u6C34', direction: '\u5317', yinYang: '\u9634' },
  { name: '\u4EA5\u65F6', timeRange: '21:00-23:00', wuxing: '\u6C34', direction: '\u4E1C\u5317', yinYang: '\u9634' },
];

// ===== \u4E03\u661F\uFF08\u7B80\u5316\u7248\uFF09=====

const QIXING: Record<string, string> = {
  '\u65E5': '\u592A\u9633/\u592A\u9634',  // \u5468\u4E00
  '\u6708': '\u592A\u9634/\u91D1\u661F',
  '\u706B': '\u91D1\u661F/\u6708\u5B5D',
  '\u6C34': '\u6708\u5B5D/\u5730\u964D',
  '\u6728': '\u5730\u964D/\u6587\u66F2',
  '\u91D1': '\u6587\u66F2/\u8350\u77F3',
  '\u571F': '\u8350\u77F3/\u592A\u9633',
};

// ===== \u8FD0\u52BF\u8BC4\u8BED\u6C60 =====

const FORTUNE_COMMENTS: {
  daji: string[];
  ji: string[];
  ping: string[];
  xiong: string[];
} = {
  daji: [
    '\u4eca\u65e5\u9ec4\u9053\u5409\u663e\uff0c\u8bf8\u4e8b\u987a\u5229\uff0c\u5927\u53ef\u4f5c\u4e3a\u5566~ \ud83c\udf1f',
    '\u5929\u65f6\u5730\u5229\uff0c\u798f\u6c14\u4e34\u95e8\uff01\u4eca\u65e5\u5fc3\u60f3\u4e8b\u6210\uff0c\u4e07\u4e8b\u5982\u610f\u54df~ \u2728',
    '\u7d2b\u4e1c\u6d41\u9f84\uff0c\u8d35\u4eba\u63d0\u643a\uff01\u4eca\u65e5\u8fd0\u52bf\u5982\u8679\uff0c\u65b0\u4e8b\u5927\u53ef\u5f00\u62d3\u5566~ \ud83c\udf40',
    '\u661f\u5149\u7ea0\u7f20\uff0c\u524d\u7a0b\u4f18\u7f8e\u3002\u4eca\u65e5\u5b9c\u5927\u81f4\u884c\u52a8\uff0c\u5fc5\u6709\u4e0d\u610f\u5916\u559c\u60ca\u54df~ \ud83d\ude0a',
    '\u9f99\u98ce\u7965\u745e\uff0c\u4e91\u5f73\u4ece\u5ba2\u3002\u4eca\u65e5\u8fd0\u58eb\u660e\u663e\uff0c\u5373\u4f7f\u5c0f\u614e\u4e5f\u80fd\u83b7\u5927\u6210\u54df~ \ud83d\udc4c',
  ],
  ji: [
    '\u4eca\u65e5\u8fd0\u52bf\u5c1a\u53ef\uff0c\u52aa\u529b\u5c31\u80fd\u6709\u56de\u62a5\u3002\u8bb0\u5f97\u7a33\u624d\u81f4\u8fdc\u54df~ \ud83d\udcaa',
    '\u6674\u5929\u973e\u96fe\uff0c\u5149\u660e\u524d\u8def\u3002\u4eca\u65e5\u52aa\u529b\u4e0d\u6d29\uff0c\u81ea\u7136\u6709\u597d\u6d88\u606f\u54df~ \ud83d\ude4c',
    '\u6625\u6696\u82b1\u5f00\uff0c\u751f\u673a\u76ce\u7136\u3002\u4eca\u65e5\u9002\u5408\u505a\u8ba1\u5212\uff0c\u628a\u63e1\u673a\u4f1a\u54df~ \ud83c\udf31',
    '\u4e91\u5f00\u89c1\u65e5\uff0c\u524d\u9014\u660e\u4eae\u3002\u4eca\u65e5\u5fc3\u6001\u79ef\u6781\u7684\u8bdd\uff0c\u4f1a\u6709\u4e0d\u9519\u7684\u6536\u83b7\u5566~ \u270c\ufe0f',
    '\u98ce\u8c03\u96e8\u987a\uff0c\u4e07\u4e8b\u5982\u610f\u3002\u4eca\u65e5\u8d70\u52bf\u5e73\u7a33\uff0c\u53ef\u4ee5\u5927\u80c6\u53bb\u5c1d\u8bd5\u65b0\u4e8b\u7269\u54df~ \ud83d\udc4d',
  ],
  ping: [
    '\u4eca\u65e5\u8fd0\u52bf\u5e73\u5e38\uff0c\u4e0d\u5dee\u4e0d\u597d\u3002\u7a33\u624d\u6c49\u53d8\uff0c\u9759\u89c2\u5176\u53d8\u54df~ \ud83d\udc6a',
    '\u98ce\u5e73\u6d6a\u9759\uff0c\u4e00\u5207\u5b89\u597d\u3002\u4eca\u65e5\u4e0d\u5b9c\u592a\u8fc7\u6fc0\u8fdb\uff0c\u5e73\u5e73\u6de1\u6de1\u4e5f\u662f\u798f\u54df~ \ud83c\udf0d',
    '\u6697\u82cf\u9700\u6f14\uff0c\u4e07\u7269\u5f85\u53d1\u3002\u4eca\u65e5\u5b9c\u5b88\u6210\uff0c\u4e0d\u5b9c\u8d7b\u52a3\u884c\u4e3a\uff0c\u9759\u5f85\u826f\u673a\u54df~ \ud83c\udf19',
    '\u6709\u5f97\u6709\u5931\uff0c\u5b88\u6b63\u4e0d\u618e\u3002\u4eca\u65e5\u5fc3\u6001\u5e73\u548c\u6700\u91cd\u8981\uff0c\u5c0f\u5fc3\u9a71\u9a73\u5373\u53ef\u54df~ \ud83e\udd14',
    '\u4e91\u5f00\u9732\u6563\uff0c\u5149\u660e\u524d\u8def\u3002\u4eca\u65e5\u8fd0\u52bf\u4e2d\u5e73\uff0c\u505a\u4e8b\u6709\u8282\u5ea6\u5c31\u80fd\u987a\u5229\u54df~ \ud83d\udc4e',
  ],
  xiong: [
    '\u4eca\u65e5\u5ba2\u661f\u4e34\u95e8\uff0c\u5b9c\u9759\u4e0d\u5b9c\u52a8\u3002\u591a\u5c45\u5bb6\u4e2d\uff0c\u5c11\u8bdd\u5c11\u505a\uff0c\u5c0f\u5fc3\u4e3a\u4e0a\u54df~ \ud83d\ude37',
    '\u9634\u96f3\u5bc6\u5e03\uff0c\u524d\u8def\u672a\u660e\u3002\u4eca\u65e5\u5b9c\u6536\u655b\uff0c\u5207\u52ff\u51b2\u52a8\uff0c\u5b88\u9759\u5f85\u65f6\u54df~ \u26a0\ufe0f',
    '\u98ce\u96e8\u6447\u6447\uff0c\u4e07\u7269\u6c89\u5bc2\u3002\u4eca\u65e5\u4e0d\u5b9c\u505a\u91cd\u5927\u51b3\u5b9a\uff0c\u4fdd\u6301\u4f4e\u8c03\u5373\u53ef\u54df~ \u2601\ufe0f',
    '\u6709\u8c0c\u5728\u524d\uff0c\u5c0f\u5fc3\u8c0c\u8ba1\u3002\u4eca\u65e5\u5fc3\u60c5\u4e0d\u7f8e\u4e5f\u6b63\u5e38\uff0c\u8bb0\u5f97\u4fdd\u62a4\u597d\u81ea\u5df1\u54df~ \ud83d\ude12',
    '\u5361\u96be\u4e2d\u7684\u8f6c\u673a\u65e5\u3002\u5fcd\u4e00\u5fcd\u5c31\u8fc7\u53bb\u4e86\uff0c\u4eca\u5929\u5c0f\u5fc3\u9a7e\u907f\u98ce\u9669\uff0c\u660e\u5929\u53c8\u662f\u65b0\u7684\u4e00\u5929\u54df~ \ud83c\udf1f',
  ],
};

// ===== \u4E94\u884C\u76F8\u751F\u76F8\u514B\u8BC4\u8BED =====

const WUXING_TIPS: Record<string, { sheng: string; ke: string }> = {
  '\u6728': {
    sheng: '\u6c34\u751f\u6728\uff0c\u4eca\u65e5\u9002\u5408\u5b66\u4e60\u3001\u521b\u4f5c\u3001\u542f\u52a8\u65b0\u9879\u76ee',
    ke: '\u6d91\u514b\u6728\uff0c\u6ce8\u610f\u60c5\u7eea\u7ba1\u7406\uff0c\u907f\u514d\u8fc7\u5ea6\u7d27\u5f20',
  },
  '\u706b': {
    sheng: '\u6728\u751f\u706b\uff0c\u4eca\u65e5\u5145\u6ee1\u6d3b\u529b\uff0c\u9002\u5408\u8868\u6f14\u3001\u6f14\u8bb2\u3001\u4ea4\u6d41',
    ke: '\u6c34\u514b\u706b\uff0c\u63a7\u5236\u813e\u6c14\uff0c\u907f\u514d\u53d1\u706b\u4e89\u5435',
  },
  '\u571f': {
    sheng: '\u706b\u751f\u571f\uff0c\u4eca\u65e5\u7a33\u91cd\u6709\u529b\uff0c\u9002\u5408\u7406\u8d22\u3001\u5b89\u6392\u8ba1\u5212',
    ke: '\u6728\u514b\u571f\uff0c\u4e0d\u8981\u56fa\u6b65\u81ea\u5c01\uff0c\u591a\u63a5\u53d7\u65b0\u4e8b\u7269',
  },
  '\u91d1': {
    sheng: '\u571f\u751f\u91d1\uff0c\u4eca\u65e5\u601d\u7ef4\u6e05\u6670\uff0c\u9002\u5408\u505a\u51b3\u7b56\u3001\u7b7e\u5408\u5408\u540c',
    ke: '\u706b\u514b\u91d1\uff0c\u5c0f\u5fc3\u8d22\u52bf\u635f\u5931\uff0c\u4e0d\u5b9c\u5927\u989d\u6295\u8d44',
  },
  '\u6c34': {
    sheng: '\u91d1\u751f\u6c34\uff0c\u4eca\u65e5\u611f\u60c5\u4e30\u5bcc\uff0c\u9002\u5408\u4ea4\u53cb\u3001\u6c9f\u901a\u3001\u4f11\u606f',
    ke: '\u571f\u514b\u6c34\uff0c\u6ce8\u610f\u4e0d\u88ab\u522b\u4eba\u60c5\u7eea\u5f71\u54cd',
  },
};

/**
 * \u4E2D\u56FD\u6C11\u4FD7\u5360\u535C\u7CFB\u7EDF
 * 
 * \u529F\u80FD:
 * - \u5929\u5E72\u5730\u652F\u65E5\u5386
 * - \u8282\u6C14\u67E5\u8BE2
 * - \u65E5\u5E38\u5B9C\u5FCC
 * - \u4E94\u884C\u8FD0\u52BF
 * - \u65F6\u8FB0\u8BF6\u62A4\u795E
 * - \u4E03\u661F\u5F53\u503C
 * - \u7EFC\u5408\u6BCF\u65E5\u8FD0\u52BF\u62A5
 */
export class FolkDivinationService {

  /**
   * \u83B7\u53D6\u6307\u5B9A\u65E5\u671F\u7684\u5B8C\u6574\u6C11\u4FD3\u5360\u535C\u62A5\u544A
   */
  getDailyFortuneReport(date?: Date): string {
    const d = date || new Date();
    
    // \u8BA1\u7B97\u57FA\u7840\u6570\u636E
    const lunar = this.getLunarDate(d);
    const gzYear = this.getGanzhiYear(d.getFullYear());
    const gzMonth = this.getGanzhiMonth(d);
    const gzDay = this.getGanzhiDay(d);
    const dayWuxing = this.getDayWuxing(gzDay.tg);
    const solarTerm = this.getCurrentSolarTerm(d);

    // \u8FD0\u52BF\u7B49\u7EA7
    const fortuneLevel = this.calculateFortuneLevel(gzDay.tg, gzDay.dz, d.getDate());
    const fortuneComment = FORTUNE_COMMENTS[fortuneLevel][
      Math.floor(Math.random() * FORTUNE_COMMENTS[fortuneLevel].length)
    ];

    // \u5B9C\u5FCC
    const yiList = YI_POOL[dayWuxing][Math.min(dayWuxing, YI_POOL[dayWuxing].length - 1)];
    const jiList = JI_POOL[dayWuxing][Math.min(dayWuxing, JI_POOL[dayWuxing].length - 1)];

    // \u4E03\u661F
    const weekDay = d.getDay();
    const qixingKey = Object.keys(QIXING)[weekDay];
    const qixingVal = QIXING[qixingKey] || '';

    // \u4E94\u884C\u5EFA\u8BAE
    const wxTip = WUXING_TIPS[WUXING_ELEMENTS[dayWuxing]];

    // \u5F53\u524D\u65F6\u8FB0
    const currentShichen = this.getCurrentShichen(d.getHours());

    // \u751F\u8096
    const yearShengxiao = SHENGXIAO[gzYear.dz % 12];

    // \u62FC\u88C5\u62A5\u544A
    const lines: string[] = [];

    // \u6807\u9898
    lines.push(
      `\u{1F4E9} **${gzYear.name}${gzMonth.name}\u5E74${gzDay.name}\u65E5** ` +
      `\u{1F319} ${lunar.monthName}${lunar.dayName}` +
      (solarTerm ? ` \u{2668} ${solarTerm.name}` : '') +
      ` \u{1F406} ${yearShengxiao}\u5E74`
    );

    // \u8FD0\u52BF
    const fortuneEmoji =
      fortuneLevel === 'daji' ? '\u{1F340}' :
      fortuneLevel === 'ji' ? '\u{1F44C}' :
      fortuneLevel === 'ping' ? '\u{1F914}' : '\u26A0\uFE0F';

    lines.push('');
    lines.push(
      `${fortuneEmoji} **\u4ECA\u65E5\u8FD0\u52BF**: ${
        fortuneLevel === 'daji' ? '\u5927\u5409' :
        fortuneLevel === 'ji' ? '\u5C0F\u5409' :
        fortuneLevel === 'ping' ? '\u5E73' : '\u5C0F\u5389'
      }**`
    );
    lines.push(`   ${fortuneComment}`);

    // \u4E94\u884C
    lines.push('');
    lines.push(
      `\uD83C\uDFF4FE0F\u200D\u2668\uFE0F **\u65E5\u4E3B\u4E94\u884C**: ${WUXING_ELEMENTS[dayWuxing]}`
    );
    lines.push(`   \u2705 ${wxTip.sheng}`);
    lines.push(`   \u26D4 ${wxTip.ke}`);

    // \u5B9C\u5FCC
    lines.push('');
    lines.push(
      `\u{1F4AF} **\u5B9C**: ${yiList}`
    );
    lines.push(
      `\u{1F6AB} **\u5FCC**: ${jiList}`
    );

    // \u65F6\u8FB0 + \u4E03\u661F
    lines.push('');
    lines.push(
      `\u{1F550} **\u5F53\u524D\u65F6\u8FB0**: ${currentShichen.name}` +
      ` (${currentShichen.timeRange}) ` +
      `${currentShichen.wuxing}\u5C5E` +
      ` ${currentShichen.direction}\u65B9`
    );
    if (qixingVal) {
      lines.push(
        `\u{1F31F} **\u4E03\u661F\u5F53\u503C**: ${qixingKey}\u661F ${qixingVal}`
      );
    }

    return lines.join('\n');
  }

  /**
   * \u83B7\u53D6\u7B80\u5316\u7248\u8FD0\u52BF\uFF08\u7528\u4E8E\u5B9A\u65F6\u53D1\u9001\uFF0C\u8F83\u77ED\uFF09
   */
  getShortFortune(date?: Date): string {
    const d = date || new Date();
    const gzDay = this.getGanzhiDay(d);
    const lunar = this.getLunarDate(d);
    const solarTerm = this.getCurrentSolarTerm(d);
    const dayWuxing = this.getDayWuxing(gzDay.tg);
    const fortuneLevel = this.calculateFortuneLevel(gzDay.tg, gzDay.dz, d.getDate());

    const yiList = YI_POOL[dayWuxing][Math.min(dayWuxing, YI_POOL[dayWuxing].length - 1)];
    const jiList = JI_POOL[dayWuxing][Math.min(dayWuxing, JI_POOL[dayWuxing].length - 1)];
    const comment = FORTUNE_COMMENTS[fortuneLevel][
      Math.floor(Math.random() * FORTUNE_COMMENTS[fortuneLevel].length)
    ];

    const parts: string[] = [];
    parts.push(
      `\u{1F4E9} ${this.getGanzhiYear(d.getFullYear()).name}` +
      `${this.getGanzhiMonth(d).name}\u6708${gzDay.name}\u65E5`
    );
    parts.push(`${lunar.monthName}${lunar.dayName}`);
    if (solarTerm) parts.push(solarTerm.name);
    parts.push('');

    const emoji =
      fortuneLevel === 'daji' ? '\u{1F340}' :
      fortuneLevel === 'ji' ? '\u{1F44C}' :
      fortuneLevel === 'ping' ? '\u{1F914}' : '\u26A0\uFE0F';
    
    parts.push(`${emoji} ${comment}`);
    parts.push(`\u{1F4AF} \u5B9C: ${yiList}`);
    parts.push(`\u{1F6AB} \u5FCC: ${jiList}`);

    return parts.join(' | ');
  }

  // ===== \u79C1\u6709\u8BA1\u7B97\u65B9\u6CD5 =====

  /**
   * \u83B7\u53D6\u5E74\u4EFD\u7684\u5E72\u652F\u5E74\u4EE3
   */
  private getGanzhiYear(year: number): { name: string; tg: number; dz: number } {
    let offset = year - 4;
    const tgIdx = offset % 10;
    const dzIdx = offset % 12;
    return {
      name: TIANGAN[tgIdx] + DIZHI[dzIdx],
      tg: tgIdx,
      dz: dzIdx,
    };
  }

  /**
   * \u83B7\u53D6\u6708\u4EFD\u7684\u5E72\u652F\u6708\u4EE3
   * \u7B80\u5316\u7248\uFF0C\u57FA\u4E8E\u5E74\u5E72\u63A8\u7B97
   */
  private getGanzhiMonth(date: Date): { name: string; tg: number; dz: number } {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    
    // \u5E74\u5E72\u8D77\u59CB\u504F\u79FB
    const yearTg = ((year - 4) % 10 + 10) % 10;
    
    // \u6BCF\u4E2A\u5E74\u7684\u6B63\u6708\u5929\u5E72\u56FA\u5B9A
    // \u7532\u5E74\u6B63\u6708=\u4E19\u5DF3\u5E9A\u7678\u8F9B\u58EC\u7532\u4E59\u4E19...
    const monthBaseTg = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0]; // \u7532\u5E74(0)\u6B63\u6708\u4ECE\u4E19(2)\u5F00\u59CB
    const baseTg = monthBaseTg[yearTg];
    const tgIdx = (baseTg + month) % 10;

    // \u5730\u652F\u56FA\u5B9A: \u5BC5\u536F\u8FB0\u5DF3\u5348\u672A\u4E30\u914C\u620C\u4EA5
    const monthDz = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1]; // \u6B63\u6708\u4ECE\u5BC5(2)\u5F00\u59CB
    const dzIdx = monthDz[month];

    return { name: TIANGAN[tgIdx] + DIZHI[dzIdx], tg: tgIdx, dz: dzIdx };
  }

  /**
   * \u83B7\u53D6\u65E5\u671F\u7684\u5E72\u652F\u65E5
   * \u57FA\u4E8E\u56FA\u5B9A\u57FA\u51C6\u65E5\u8BA1\u7B97
   */
  private getGanzhiDay(date: Date): { name: string; tg: number; dz: number } {
    // \u4EE5 1900-01-01 (\u7532\u5B50\u65E5) \u4E3A\u57FA\u51C6
    const baseDate = new Date(1900, 0, 1);
    const diffMs = date.getTime() - baseDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const tgIdx = ((diffDays % 10) + 10) % 10;
    const dzIdx = ((diffDays % 12) + 12) % 12;

    return { name: TIANGAN[tgIdx] + DIZHI[dzIdx], tg: tgIdx, dz: dzIdx };
  }

  /**
   * \u83B7\u53D6\u65E5\u5E72\u7684\u4E94\u884C
   */
  private getDayWuxing(tgIndex: number): number {
    return TIANGAN_WUXING[tgIndex];
  }

  /**
   * \u83B7\u53D6\u7B80\u5316\u519C\u5386\u65E5\u671F
   * \u6CE8: \u8FD9\u662F\u7B80\u5316\u7248\u672C\uFF0C\u4E0D\u5305\u542B\u95F0\u6708\u7B49\u590D\u6742\u89C4\u5219
   */
  private getLunarDate(date: Date): { monthName: string; dayName: string } {
    const LUNAR_MONTHS: string[] = [
      '', '\u6B63\u6708', '\u4E8C\u6708', '\u4E09\u6708', '\u56DB\u6708',
      '\u4E94\u6708', '\u516D\u6708', '\u4E03\u6708', '\u516B\u6708',
      '\u4E5D\u6708', '\u5341\u6708', '\u5341\u4E00\u6708', '\u5341\u4E8C\u6708',
    ];
    const LUNAR_DAYS: string[] = [
      '',
      '\u521D\u4E00', '\u521D\u4E8C', '\u521D\u4E09', '\u521D\u56DB', '\u521D\u4E94',
      '\u521D\u516D', '\u521D\u4E03', '\u521D\u516B', '\u521D\u4E5D', '\u521D\u5341',
      '\u5341\u4E00', '\u5341\u4E8C', '\u5341\u4E09', '\u5341\u56DB', '\u5341\u4E94',
      '\u5341\u516D', '\u5341\u4E03', '\u5341\u516B', '\u5341\u4E5D', '\u4E8C\u5341',
      '\u5EFF\u4E00', '\u5EFF\u4E8C', '\u5EFF\u4E09', '\u5EFF\u56DB', '\u5EFF\u4E94',
      '\u5EFF\u516D', '\u5EFF\u4E03', '\u5EFF\u516B', '\u5EFF\u4E5D', '\u4E09\u5341',
    ];

    // \u7B80\u5316: \u7528\u516C\u5386\u6708/\u65E5\u8FD1\u4F3C\u519C\u5386
    const m = date.getMonth() + 1;
    const d = date.getDate();

    return {
      monthName: LUNAR_MONTHS[m],
      dayName: LUNAR_DAYS[d],
    };
  }

  /**
   * \u83B7\u53D6\u5F53\u524D\u8282\u6C14
   */
  private getCurrentSolarTerm(date: Date): SolarTerm | null {
    const m = date.getMonth() + 1;
    const d = date.getDate();

    for (const term of SOLAR_TERMS) {
      if (term.approxMonthDay[0] === m && Math.abs(term.approxMonthDay[1] - d) <= 3) {
        return term;
      }
    }
    return null;
  }

  /**
   * \u8BA1\u7B97\u8FD0\u52BF\u7B49\u7EA7
   * \u57FA\u4E8E\u5929\u5E72\u3001\u5730\u652F\u3001\u65E5\u671F\u7684\u7EFC\u5408\u5224\u65AD
   */
  private calculateFortuneLevel(tgIdx: number, dzIdx: number, dayOfMonth: number):
    'daji' | 'ji' | 'ping' | 'xiong'
  {
    let score = 50; // \u57FA\u7840\u5206

    // \u5929\u5E52\u52A0\u6210
    // \u7532(\u5927\u5409)\u4E59(\u5409)\u4E19(\u5E73)\u4E01(\u5409)\u620A(\u5E73)
    // \u5DF2(\u5409)\u5E9A(\u5927\u5409)\u8F9B(\u5E73)\u58EC(\u5E73)\u7678(\u5E73)
    const tgScore = [15, 10, 0, 8, -5, 10, 15, 0, 0, 5][tgIdx];
    score += tgScore;

    // \u5730\u652F\u52A0\u6210
    // \u5B50(\u5E73)\u4E11(\u51F8)\u5BC5(\u5409)\u536F(\u5409)\u8FB0(\u5409)\u5DF3(\u5E73)
    // \u5348(\u5E73)\u672A(\u51F8)\u4E30(\u5409)\u914C(\u5E73)\u620C(\u51F8)\u4EA5(\u5E73)
    const dzScore = [0, -8, 10, 10, 10, 0, 0, -8, 10, 0, -8, 0][dzIdx];
    score += dzScore;

    // \u65E5\u671F\u968F\u673A\u6CE2\u52A8
    const dateSeed = (dayOfMonth * 7 + dzIdx * 3) % 17;
    score += (dateSeed % 11) - 5;

    // \u5207\u5206
    if (score >= 70) return 'daji';
    if (score >= 55) return 'ji';
    if (score >= 40) return 'ping';
    return 'xiong';
  }

  /**
   * \u83B7\u53D6\u5F53\u524D\u65F6\u8FB0
   */
  private getCurrentShichen(hour: number): ShichenInfo {
    // \u5B50\u65F6(23-1), \u4E11\u65F6(1-3), ...
    let idx: number;
    if (hour >= 23 || hour < 1) idx = 0;
    else idx = Math.floor((hour + 1) / 2);
    
    return SHICHEN[idx];
  }
}
