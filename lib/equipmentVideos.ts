// Hand-picked "how to use it" video per common piece of gym equipment --
// same approach as muscleGroupVideos.ts. Every entry below was checked
// against YouTube's oEmbed endpoint (confirms the video is real, live, and
// records its actual title/channel) before being added here -- past
// mistake: an earlier draft of this file invented plausible-looking IDs by
// hand, and most of them turned out to be dead or nonexistent. Never add an
// entry without that check.
//
// The equipment scan result is free text (Claude names the equipment in its
// own words), not a fixed value from a catalog, so the match is by keyword
// against that text -- same technique CoursesScreen uses to pick a course
// image from its title. First matching entry wins, so more specific
// equipment (e.g. "leg press") is listed before broader ones (e.g. "cable
// machine") it could otherwise be confused with.
export type EquipmentVideo = {
  videoId: string;
  title: string;
  channel: string;
};

export const EQUIPMENT_VIDEOS: { keywords: string[]; video: EquipmentVideo }[] = [
  {
    keywords: ['smith machine'],
    video: { videoId: 'sz0p024m3Ag', title: 'How To Use a SMITH MACHINE (Upper & Lower Body)', channel: 'Athlean-XX for Women' },
  },
  {
    keywords: ['leg press'],
    video: { videoId: 'IZxyjW7MPJQ', title: 'How To: Seated Leg Press (Cybex)', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['leg extension'],
    video: { videoId: 'YyvSfVjQeL0', title: 'How To: Leg Extension (Cybex)', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['leg curl', 'hamstring curl'],
    video: { videoId: 'S367qaHeYWU', title: 'How to Use Leg Curl Machines (Prone & Seated) | Proper Setup & Form', channel: 'Fitness 19' },
  },
  {
    keywords: ['lat pulldown', 'pulldown machine'],
    video: { videoId: 'CAwf7n6Luuc', title: 'How To: Lat Pulldown | 3 Golden Rules', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['cable row', 'seated row'],
    video: { videoId: 'GZbfZ033f74', title: 'How To: Seated Low Row (LF Cable)', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['cable machine', 'cable crossover', 'cable station'],
    video: { videoId: 'KmciXk2pzKk', title: 'How to Use the Cable Machine for Gym Newbies!', channel: 'BodyKinect by Kendall' },
  },
  {
    keywords: ['chest press machine'],
    video: { videoId: 'xUm0BiZCWlQ', title: 'How To: Chest Press (Cybex)', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['pec deck', 'chest fly machine'],
    video: { videoId: 'wsNAD1BpiaE', title: 'How To Do Use The Pec Deck Machine', channel: 'Kelly Matthews' },
  },
  {
    keywords: ['shoulder press machine'],
    video: { videoId: 'TnhIyp4kmO8', title: 'How To Use The Shoulder Press Machine', channel: 'PureGym' },
  },
  {
    keywords: ['squat rack', 'power rack', 'squat cage'],
    video: { videoId: 'nhoikoUEI8U', title: 'Learning to Squat | The Starting Strength Method', channel: 'Starting Strength' },
  },
  {
    keywords: ['incline bench'],
    video: { videoId: 'SrqOu55lrYU', title: 'How To: Incline Barbell Bench Press | 3 Golden Rules', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['bench press', 'flat bench'],
    video: { videoId: 'rT7DgCr-3pg', title: 'How To: Barbell Bench Press', channel: 'ScottHermanFitness' },
  },
  {
    keywords: ['ab crunch machine', 'abdominal machine'],
    video: { videoId: 'CNHS2OoUi30', title: 'How To Use The Seated Abdominal Crunch Machine (Matrix)', channel: 'Live Lean TV Daily Exercises' },
  },
  {
    keywords: ['hip thrust machine', 'glute machine', 'hip abduction'],
    video: { videoId: '8xJ0Vxjv0sw', title: 'Hip Thrust Machine: Quick Tutorial for Maximum Glute Activation', channel: 'One Minute Tutorial' },
  },
  {
    keywords: ['rowing machine', 'rower', 'erg'],
    video: { videoId: '4zWu1yuJ0_g', title: 'Correct Rowing Machine Technique, Improve Your Rowing', channel: 'Concept2' },
  },
  {
    keywords: ['treadmill'],
    video: { videoId: '76XnbF5DBFY', title: "How To Use A Treadmill Correctly | GTN's Guide For Beginners", channel: 'Global Triathlon Network' },
  },
  {
    keywords: ['elliptical'],
    video: { videoId: 'j38LNpTLwzY', title: 'How To Use An Elliptical | Beginner’s Guide', channel: 'Naomi Kong' },
  },
  {
    keywords: ['stationary bike', 'exercise bike', 'spin bike'],
    video: { videoId: 'z99qyGHnFLI', title: 'How to Use a Stationary Bike', channel: 'OrthoVirginia' },
  },
  {
    keywords: ['stair climber', 'stair master', 'stairmaster'],
    video: { videoId: 'ST-5lD69XqU', title: 'How to Use a Stair Climber', channel: 'Planet Fitness' },
  },
  {
    keywords: ['kettlebell'],
    video: { videoId: 'yBMWrq2vAGM', title: 'Kettlebell Workout for Beginners (Intro to Kettlebells 101)', channel: 'Athlean-XX for Women' },
  },
  {
    keywords: ['dumbbell'],
    video: { videoId: 'BNsKEG3hIzI', title: 'Basic Beginner Introductory Dumbbell Exercises', channel: 'Whats Up Dude' },
  },
  {
    keywords: ['barbell'],
    video: { videoId: 'CVrTmUF9yJ8', title: "Beginner's Guide to Barbell Squats", channel: 'MDJ Fitness' },
  },
  {
    keywords: ['resistance band'],
    video: { videoId: '7GHoyzgXwpk', title: 'How to Use Resistance Bands: Best Beginner Guide', channel: 'Bob & Brad' },
  },
  {
    keywords: ['pull-up bar', 'pullup bar', 'chin-up bar'],
    video: { videoId: 'eGo4IYlbE5g', title: 'The Perfect Pull Up - Do It Right!', channel: 'Calisthenicmovement' },
  },
  {
    keywords: ['dip station', 'dip bar'],
    video: { videoId: '2z8JmcrW-As', title: 'The Perfect Dip - Do It Right', channel: 'Calisthenicmovement' },
  },
];

export function getEquipmentVideo(scanResultText: string): EquipmentVideo | null {
  const t = scanResultText.toLowerCase();
  const match = EQUIPMENT_VIDEOS.find((e) => e.keywords.some((k) => t.includes(k)));
  return match?.video ?? null;
}
