// Shared vocabulary for the Sparrow client and server. Plain data only.

export const GRADES = [9, 10, 11, 12];

export const INTERESTS = [
  { id: "medicine", label: "Medicine & health", icon: "stethoscope", programs: ["health", "biological"] },
  { id: "biology", label: "Biology & neuroscience", icon: "brain", programs: ["biological", "psychology"] },
  { id: "computing", label: "Computer science", icon: "code", programs: ["computer"] },
  { id: "engineering", label: "Engineering & robotics", icon: "cpu", programs: ["engineering", "engineering_technology"] },
  { id: "math", label: "Math & physics", icon: "atom", programs: ["mathematics", "physical_science"] },
  { id: "environment", label: "Environment & climate", icon: "leaf", programs: ["resources", "agriculture", "physical_science"] },
  { id: "business", label: "Business & entrepreneurship", icon: "briefcase", programs: ["business_marketing"] },
  { id: "policy", label: "Law, policy & government", icon: "landmark", programs: ["social_science", "public_administration_social_service", "legal"] },
  { id: "writing", label: "Writing & journalism", icon: "pen-tool", programs: ["english", "communication"] },
  { id: "arts", label: "Visual & performing arts", icon: "palette", programs: ["visual_performing"] },
  { id: "music", label: "Music", icon: "music", programs: ["visual_performing"] },
  { id: "education", label: "Education & mentoring", icon: "book-open", programs: ["education"] },
  { id: "service", label: "Community service", icon: "heart-handshake", programs: ["public_administration_social_service"] },
  { id: "exploring", label: "Still exploring", icon: "compass", programs: [] },
];

export const GOALS = [
  { id: "extracurriculars", label: "Find extracurriculars", types: ["club", "program"] },
  { id: "summer", label: "Summer programs", types: ["program"] },
  { id: "research", label: "Research experience", types: ["research"] },
  { id: "internships", label: "Internships & jobs", types: ["internship"] },
  { id: "volunteering", label: "Volunteering", types: ["volunteering"] },
  { id: "competitions", label: "Competitions & awards", types: ["competition", "award"] },
  { id: "scholarships", label: "Scholarships", types: ["scholarship"] },
  { id: "colleges", label: "Build a college list", types: [] },
  { id: "applications", label: "Prepare applications", types: [] },
];

export const PERSONAS = [
  { id: "exploring", label: "Exploring", description: "I'm still figuring out what I like." },
  { id: "building", label: "Building", description: "I have something I love and want to go deeper." },
  { id: "applying", label: "Applying", description: "I'm getting ready for college applications." },
];

export const OPPORTUNITY_TYPES = [
  { id: "program", label: "Program", icon: "rocket" },
  { id: "competition", label: "Competition", icon: "trophy" },
  { id: "research", label: "Research", icon: "flask-conical" },
  { id: "internship", label: "Internship", icon: "briefcase" },
  { id: "volunteering", label: "Volunteering", icon: "heart-handshake" },
  { id: "award", label: "Award", icon: "medal" },
  { id: "scholarship", label: "Scholarship", icon: "graduation-cap" },
  { id: "club", label: "Club & organization", icon: "users" },
];

export const FORMATS = [
  { id: "virtual", label: "Virtual" },
  { id: "in_person", label: "In person" },
  { id: "hybrid", label: "Hybrid" },
  { id: "varies", label: "Varies" },
];

export const COSTS = [
  { id: "free", label: "Free" },
  { id: "paid", label: "Fee" },
  { id: "varies", label: "Varies" },
  { id: "unknown", label: "Check site" },
];

export const STATUSES = [
  { id: "interested", label: "Interested" },
  { id: "preparing", label: "Preparing" },
  { id: "submitted", label: "Submitted" },
  { id: "accepted", label: "Accepted" },
  { id: "closed", label: "Closed" },
];

export const BUDGETS = [
  { id: "free", label: "Free only" },
  { id: "low", label: "Up to $100" },
  { id: "medium", label: "Up to $500" },
  { id: "flexible", label: "Flexible" },
];

export const FORMAT_PREFS = [
  { id: "virtual", label: "Virtual" },
  { id: "in_person", label: "In person" },
  { id: "either", label: "Either" },
];

export const STUDY_LOCATIONS = [
  { id: "home_state", label: "In my state" },
  { id: "region", label: "In my region" },
  { id: "anywhere", label: "Anywhere in the U.S." },
  { id: "unsure", label: "Not sure yet" },
];

export const COLLEGE_TAGS = [
  { id: "top_choice", label: "Top choice" },
  { id: "considering", label: "Considering" },
  { id: "visit_planned", label: "Visit planned" },
  { id: "applying", label: "Applying" },
];

export const ACTIVITY_CATEGORIES = [
  "Academic", "Art", "Athletics: Club", "Athletics: JV/Varsity", "Career-Oriented",
  "Community Service (Volunteer)", "Computer/Technology", "Cultural", "Dance", "Debate/Speech",
  "Environmental", "Family Responsibilities", "Foreign Exchange", "Foreign Language", "Internship",
  "Journalism/Publication", "Junior R.O.T.C.", "LGBT", "Music: Instrumental", "Music: Vocal",
  "Religious", "Research", "Robotics", "School Spirit", "Science/Math", "Social Justice",
  "Student Govt./Politics", "Theater/Drama", "Work (Paid)", "Other Club/Activity",
];

export const HONOR_LEVELS = [
  { id: "school", label: "School" },
  { id: "state_regional", label: "State/Regional" },
  { id: "national", label: "National" },
  { id: "international", label: "International" },
];

// Common App-style character limits.
export const LIMITS = { position: 50, organization: 100, description: 150, honor: 100, activities: 10, honors: 5 };

export const PROGRAM_LABELS = {
  agriculture: "Agriculture", resources: "Natural resources", architecture: "Architecture",
  ethnic_cultural_gender: "Area & cultural studies", communication: "Communication", communications_technology: "Communications tech",
  computer: "Computer science", personal_culinary: "Culinary & personal services", education: "Education",
  engineering: "Engineering", engineering_technology: "Engineering technology", language: "Languages",
  family_consumer_science: "Family & consumer science", legal: "Legal studies", english: "English",
  humanities: "Liberal arts & humanities", library: "Library science", biological: "Biology",
  mathematics: "Math & statistics", military: "Military science", multidiscipline: "Interdisciplinary studies",
  parks_recreation_fitness: "Parks, recreation & fitness", philosophy_religious: "Philosophy & religion",
  theology_religious_vocation: "Theology", physical_science: "Physical sciences", science_technology: "Science technologies",
  psychology: "Psychology", security_law_enforcement: "Criminal justice", public_administration_social_service: "Public administration & social service",
  social_science: "Social sciences", construction: "Construction", mechanic_repair_technology: "Mechanic & repair tech",
  precision_production: "Precision production", transportation: "Transportation", visual_performing: "Visual & performing arts",
  health: "Health professions", business_marketing: "Business & marketing", history: "History",
};

export const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"],
  ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const CENSUS_REGIONS = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};

export function regionOf(state) {
  for (const [name, states] of Object.entries(CENSUS_REGIONS)) if (states.includes(state)) return name;
  return null;
}

export function stateName(code) {
  return STATES.find(([c]) => c === code)?.[1] ?? null;
}

const index = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
export const BY_ID = {
  interest: index(INTERESTS), goal: index(GOALS), type: index(OPPORTUNITY_TYPES), format: index(FORMATS),
  cost: index(COSTS), status: index(STATUSES), budget: index(BUDGETS), persona: index(PERSONAS),
  formatPref: index(FORMAT_PREFS), studyLocation: index(STUDY_LOCATIONS), tag: index(COLLEGE_TAGS), honor: index(HONOR_LEVELS),
};

export const ids = (list) => list.map((item) => item.id);

// A general, school-year roadmap. Items are guidance, not deadlines; dates always come from official sources.
export const ROADMAP = {
  9: {
    title: "Find what you enjoy",
    terms: {
      fall: ["Try one club or activity that sounds fun", "Set up a weekly homework and study routine", "Meet your school counselor and ask what support is available"],
      spring: ["Start a simple record of your activities, projects and awards", "Look for a summer program, camp, job or volunteer role", "Choose next year's classes with your interests in mind"],
      summer: ["Read for fun and explore a new interest", "Volunteer or work a few hours a week if you can", "Update your activity record"],
    },
  },
  10: {
    title: "Build on what you love",
    terms: {
      fall: ["Pick one or two activities to go deeper in", "Ask your counselor about the PSAT 10 or other practice tests", "Keep your activity record up to date"],
      spring: ["Plan a challenging but realistic class schedule for junior year", "Apply to summer programs or look for a summer job", "Visit a nearby college campus or take a virtual tour"],
      summer: ["Work on a personal project you care about", "Talk with adults about the careers they have", "Start a list of colleges you're curious about"],
    },
  },
  11: {
    title: "Explore your options",
    terms: {
      fall: ["Take the PSAT/NMSQT if your school offers it", "Build a first college shortlist", "Look into leadership roles in your activities"],
      spring: ["Decide on testing plans with your counselor (SAT, ACT or test-optional)", "Ask two teachers who know you well about recommendation letters", "Research summer programs, jobs or research opportunities"],
      summer: ["Brainstorm and draft your college essay", "Visit colleges or join virtual information sessions", "Write clear, specific descriptions for your activities list"],
    },
  },
  12: {
    title: "Follow through",
    terms: {
      fall: ["Confirm application deadlines on each college's official site", "Finish your essays and activities list", "Complete the FAFSA and any aid forms your colleges require"],
      spring: ["Watch your email and portals for decisions and aid offers", "Compare financial aid offers with a trusted adult", "Choose your school and confirm its enrollment deadline"],
      summer: ["Complete orientation and housing steps", "Send your final transcript", "Thank the people who helped you along the way"],
    },
  },
};

export const TERMS = [
  { id: "fall", label: "Fall" },
  { id: "spring", label: "Spring" },
  { id: "summer", label: "Summer" },
];
