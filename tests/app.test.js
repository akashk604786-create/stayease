const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const fs = require("fs");

let mongoServer;
let app;
let Home;
let User;

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
  User = require("../models/user");
});

// Every home needs an owning host, so tests make one first.
const createHost = async (email = "host@example.com") =>
  User.create({
    firstName: "Host",
    email,
    password: "hashed-is-fine-here",
    userType: "host",
  });

const createHome = (host, overrides = {}) =>
  Home.create({
    houseName: "Lakeview Cottage",
    price: 120,
    location: "Chandigarh",
    rating: 4.5,
    host: host._id,
    ...overrides,
  });

// Signs up and logs in a host, returning an agent that carries the session.
const loginAsHost = async (email) => {
  const credentials = { ...validSignup, email, userType: "host" };
  await request(app).post("/signup").type("form").send(credentials);
  const agent = request.agent(app);
  await agent
    .post("/login")
    .type("form")
    .send({ email: credentials.email, password: credentials.password });
  const user = await User.findOne({ email });
  return { agent, user };
};

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
    const host = await createHost();
    await createHome(host);

    const res = await request(app).get("/homes");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Lakeview Cottage");
  });

  it("shows a single home's details", async () => {
    const host = await createHost();
    const home = await createHome(host, {
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

    const host = await createHost("beachhost@example.com");
    const home = await createHome(host, {
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

describe("Host ownership", () => {
  it("lists only the logged-in host's own homes", async () => {
    const owner = await loginAsHost("owner@example.com");
    const other = await loginAsHost("other@example.com");

    await createHome(owner.user, { houseName: "My Own Cottage" });
    await createHome(other.user, { houseName: "Someone Elses Villa" });

    const res = await owner.agent.get("/host/host-home-list");

    expect(res.status).toBe(200);
    expect(res.text).toContain("My Own Cottage");
    expect(res.text).not.toContain("Someone Elses Villa");
  });

  it("assigns a new home to the host who created it", async () => {
    const { agent, user } = await loginAsHost("creator@example.com");

    await agent
      .post("/host/add-home")
      .field("houseName", "Fresh Listing")
      .field("price", "999")
      .field("location", "Shimla")
      .field("rating", "4.1")
      .field("description", "A new place")
      .attach("photo", Buffer.from("fake-png-bytes"), {
        filename: "photo.png",
        contentType: "image/png",
      });

    const home = await Home.findOne({ houseName: "Fresh Listing" });
    expect(home).not.toBeNull();
    expect(String(home.host)).toBe(String(user._id));

    // multer really wrote this to uploads/ — don't leave it in the repo.
    fs.rmSync(home.photo, { force: true });
  });

  it("will not open another host's home for editing", async () => {
    const owner = await loginAsHost("owner2@example.com");
    const attacker = await loginAsHost("attacker2@example.com");
    const home = await createHome(owner.user, { houseName: "Protected Cottage" });

    const res = await attacker.agent.get(`/host/edit-home/${home._id}?editing=true`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/host/host-home-list");
  });

  it("will not let another host edit a home they do not own", async () => {
    const owner = await loginAsHost("owner3@example.com");
    const attacker = await loginAsHost("attacker3@example.com");
    const home = await createHome(owner.user, { houseName: "Untouched Cottage" });

    await attacker.agent.post("/host/edit-home").type("form").send({
      id: home._id.toString(),
      houseName: "Hijacked",
      price: 1,
      location: "Nowhere",
      rating: 1,
      description: "changed",
    });

    const unchanged = await Home.findById(home._id);
    expect(unchanged.houseName).toBe("Untouched Cottage");
  });

  it("will not let another host delete a home they do not own", async () => {
    const owner = await loginAsHost("owner4@example.com");
    const attacker = await loginAsHost("attacker4@example.com");
    const home = await createHome(owner.user, { houseName: "Survivor Cottage" });

    await attacker.agent.post(`/host/delete-home/${home._id}`);

    const survivor = await Home.findById(home._id);
    expect(survivor).not.toBeNull();
    expect(survivor.houseName).toBe("Survivor Cottage");
  });

  it("lets the owner edit and delete their own home", async () => {
    const { agent, user } = await loginAsHost("selfserve@example.com");
    const home = await createHome(user, { houseName: "Editable Cottage" });

    await agent.post("/host/edit-home").type("form").send({
      id: home._id.toString(),
      houseName: "Renamed Cottage",
      price: 150,
      location: "Kasauli",
      rating: 4.6,
      description: "updated",
    });

    const edited = await Home.findById(home._id);
    expect(edited.houseName).toBe("Renamed Cottage");

    await agent.post(`/host/delete-home/${home._id}`);
    expect(await Home.findById(home._id)).toBeNull();
  });
});
