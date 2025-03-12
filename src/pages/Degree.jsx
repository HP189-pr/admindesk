import React from "react";
import { FaPlus, FaSearch } from "react-icons/fa";

const Degree = () => {
  return (
    <div>
      <h1>Degree Page</h1>
      <button>Click Me</button>
      <button>
        <FaPlus /> Add
      </button>
      <button>
        <FaSearch /> Search
      </button>
    </div>
  );
};

export default Degree;
