const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let app;
let Home;

const validSignup = {
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  password: "Password1!",
  confirmPassword: "Password1!",
  userType: "guest",
  terms: "on",
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.SESSION_SECRET = "test_session_secret";

  await mongoose.connect(process.env.MONGO_URI);

  const createApp = require("../app");
  app = createApp();
  Home = require("../models/home");
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe("Signup", () => {
  it("creates a new user and redirects to login", async () => {
    const res = await request(app).post("/signup").type("form").send(validSignup);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("rejects a weak password", async () => {
    const res = await request(app)
      .post("/signup")
      .type("form")
      .send({ ...validSignup, password: "weak", confirmPassword: "weak" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Password should be atleast 8 characters long");
  });

  it("rejects mismatched passwords", async () => {
    const res = await request(app)
      .post("/signup")
      .type("form")
      .send({ ...validSignup, confirmPassword: "Different1!" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Passwords do not match");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/signup").type("form").send(validSignup);
    const res = await request(app).post("/signup").type("form").send(validSignup);

    expect(res.status).toBe(422);
  });
});

describe("Login / Logout", () => {
  beforeEach(async () => {
    await request(app).post("/signup").type("form").send(validSignup);
  });

  it("logs in with correct credentials and starts a session", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ email: validSignup.email, password: validSignup.password });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/login")
      .type("form")
      .send({ email: validSignup.email, password: "WrongPassword1!" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("Invalid Password");
  });

  it("rejects a non-existent email", async () => {
    const res = await request(app)
      .post("/login")
      .type("form")
      .send({ email: "nouser@example.com", password: "Password1!" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("User does not exist");
  });

  it("logs out and destroys the session", async () => {
    const agent = request.agent(app);
    await agent
      .post("/login")
      .type("form")
      .send({ email: validSignup.email, password: validSignup.password });

    const res = await agent.post("/logout");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});

describe("Home listings", () => {
  it("lists all registered homes", async () => {
    await Home.create({
      houseName: "Lakeview Cottage",
      price: 120,
      location: "Chandigarh",
      rating: 4.5,
    });

    const res = await request(app).get("/homes");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Lakeview Cottage");
  });

  it("shows a single home's details", async () => {
    const home = await Home.create({
      houseName: "Mountain Retreat",
      price: 200,
      location: "Manali",
      rating: 4.8,
    });

    const res = await request(app).get(`/homes/${home._id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Mountain Retreat");
  });
});

describe("Favourites (requires authentication)", () => {
  it("adds and removes a home from the logged-in user's favourites", async () => {
    await request(app).post("/signup").type("form").send(validSignup);
    const agent = request.agent(app);
    await agent
      .post("/login")
      .type("form")
      .send({ email: validSignup.email, password: validSignup.password });

    const home = await Home.create({
      houseName: "Beach House",
      price: 300,
      location: "Goa",
      rating: 4.9,
    });

    const addRes = await agent.post("/favourites").type("form").send({ id: home._id.toString() });
    expect(addRes.status).toBe(302);

    const listRes = await agent.get("/favourites");
    expect(listRes.text).toContain("Beach House");

    const removeRes = await agent.post(`/favourites/delete/${home._id}`);
    expect(removeRes.status).toBe(302);
  });

  it("redirects unauthenticated users away from /host routes", async () => {
    const res = await request(app).get("/host/add-home");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});
